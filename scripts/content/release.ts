/**
 * npm run content:release -- --version <n> [--allow-frozen] [--out <file>]
 *                            [--chunk-kb <n>] [--today <date>] [--json]
 * npm run content:release -- --fixtures [--check]
 *
 * The sealed release (ARCHITECTURE §5.4, SQL-3). It decrypts content/sealed/
 * in memory with the content key (QZ_CONTENT_KEY or
 * ~/.config/quiz-web-app/content.key), validates it as
 * `content:check -- --sealed` does, and writes
 * supabase/.generated/content-release-<n>.sql, which git ignores. With
 * QZ_SEALED_PLAINTEXT=1 (the upgrade path of §5.4) it reads the plaintext
 * workspace instead.
 *
 * The file is a list of chunks, each one statement: a call to one loader of
 * supabase/migrations/20261104000600_content.sql with its rows as JSON. The
 * order is fixed: content rows (mysteries, encores, sealed questions, room
 * packs, challenge packs), then schedule rows (Dailies, spare sets), then
 * private.verify_release, then private.record_release, which writes the
 * content_releases row last. Answer entities are not in it: they load
 * first, from the committed supabase/seed/answer-entities.sql. The
 * orchestrator sends each chunk as its own execute_sql call, in order. A
 * chunk applies or fails whole, a failed chunk leaves the release
 * unrecorded, and running the same file again changes nothing.
 *
 * What a release decides:
 *   - Items: every active item, and every retired one so the database marks
 *     it retired. Drafts, items in checking and cut items never load.
 *   - Dailies: the main track's schedule. A Daily is ready when every item
 *     carries a passing pass D for its date against the list versions that
 *     ship now and none is due for review on or before it (CONTENT_GUIDE
 *     §9.9 rule 7, §10.7); only a ready Daily ever freezes (§8.7). Its spare
 *     order gets the rule codes each spare would break against that date's
 *     neighbours (§5.1.1): the week rules, recent answers as distractors,
 *     repeats, and the single-Daily rules at that date.
 *   - Spare sets: only those whose every item passed pass D for a spare.
 *   - Room packs: only those whose 15 questions all load.
 *   - Challenge packs: every pack of the track, as a draft; the database
 *     publishes one once 30 Dailies have closed (PRD §3.6.1).
 * Frozen Dailies, and items on them, are refused by the loaders unless
 * --allow-frozen is passed for a correction.
 *
 * Everything it prints goes through the redacting reporter
 * (scripts/content/lib/report.ts): ids, rule codes, field paths and counts,
 * never content, and an error thrown while sealed content is open prints
 * one line that says nothing about it.
 *
 * --fixtures builds the e2e track's release from content/fixtures/ instead
 * (ARCHITECTURE §5.6, §8.17): supabase/seed/e2e-track.sql, committed,
 * because fixtures are invented and public. It holds the fixture answer
 * entities, the fixture content, a Daily for every date from 1 November
 * 2026 to 31 December 2028 by the e2e cycle (content/fixtures/README.md),
 * ready, since pass D checks facts and fixtures have none, and the spare
 * sets. It also writes supabase/tests/content/fixture-release.test.sql, the
 * same release cut to one week, with the rows it must leave. --check
 * compares both with what is committed instead of writing.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadBank, type Bank } from "../../src/content/pipeline/bank.ts";
import { parseCli, str, todayUtc } from "../../src/content/pipeline/cli.ts";
import {
  findRepoRoot,
  repoRelative,
  resolveLayout,
  type Layout,
} from "../../src/content/pipeline/layout.ts";
import {
  ChallengePackSchema,
  type ChallengePack,
} from "../../src/content/schema/challenge-packs.ts";
import type {
  Encore,
  Mystery,
  RoomQuestion,
} from "../../src/content/schema/items.ts";
import { ANSWER_TYPES } from "../../src/content/schema/primitives.ts";
import type { RoundRecord } from "../../src/content/schema/schedule.ts";
import { compositionIdOf } from "../../src/engine/composition.ts";
import { MYSTERY_MAX_POINTS } from "../../src/engine/scoring/mystery.ts";
import { dailyNumberFor } from "../../src/engine/time/calendar.ts";
import type { RoundType } from "../../src/engine/types/rounds.ts";
import { mcpConfirmationReasons, scanForbidden } from "../sql/lib.ts";
import {
  isEnvelope,
  keySourceFromProcess,
  loadMasterKey,
  openEnvelope,
  type SealKeys,
} from "./crypto.ts";
import { lintBank } from "./lint.ts";
import {
  ProjectionError,
  isShippedEntity,
  optionLabelOf,
  projectEncore,
  projectMystery,
  projectSealedChoice,
} from "./lib/project.ts";
import { printReport, runReported, type ReportFinding } from "./lib/report.ts";
import {
  cnt1Findings,
  passD,
  resolveDay,
  scheduleDayRules,
  trackDays,
  type ScheduleDay,
} from "./lib/rules.ts";
import { sealedExtras } from "./lib/sealed-files.ts";
import { sqlText } from "./lib/sql.ts";

export type Track = "main" | "e2e";

/** The e2e track's dates (ARCHITECTURE §8.17). */
export const E2E_FROM = "2026-11-01";
export const E2E_THROUGH = "2028-12-31";
export const E2E_SEED_PATH = "supabase/seed/e2e-track.sql";
export const FIXTURE_TEST_PATH =
  "supabase/tests/content/fixture-release.test.sql";
/** The week the generated SQL test loads: both AC-DLY-09 dates and cycle days. */
export const FIXTURE_TEST_FROM = "2026-11-14";
export const FIXTURE_TEST_DAYS = 4;
/** The clock the generated SQL test runs at: before every Daily it loads opens. */
export const FIXTURE_TEST_CLOCK = "2026-11-10T00:00:00Z";
/** The largest statement written, comfortably inside one MCP execute_sql call. */
export const DEFAULT_CHUNK_BYTES = 60_000;
/**
 * The fixture tree's pack of the fixture Dailies' choice rounds
 * (content/fixtures/README.md): its questions load as sealed questions,
 * but it is never a hostable room pack.
 */
const NOT_HOSTABLE = new Set(["dly"]);
/** A choice round scores 1 and an encore 0 (the round plugins' maxPoints). */
const MAX_POINTS: Readonly<Record<string, number>> = {
  mystery: MYSTERY_MAX_POINTS,
  encore: 0,
  mc: 1,
  tf: 1,
  comparison: 1,
};

// ---------------------------------------------------------------------------
// Rows, in the shapes the loaders read (snake_case, one key per column)
// ---------------------------------------------------------------------------

export interface EntityRow {
  answer_type: string;
  entity_id: string;
  display: string;
  option_label: string;
  active: boolean;
}

export interface MysteryRow {
  id: string;
  category: string;
  answer_type: string;
  answer_entity: string;
  accepted_entities: string[];
  clues: string[];
  distractors: string[];
  slot: number;
  explanation: string;
  learn_more: string;
  source_labels: string[];
  review_by: string | null;
  status: "active" | "retired";
}

export interface EncoreRow {
  id: string;
  category: string;
  question: string;
  unit: string;
  unit_short: string;
  unit_label: string;
  value_kind: "quantity" | "year";
  answer: number;
  decimals: number;
  bullseye: number | null;
  close: number | null;
  explanation: string;
  learn_more: string;
  source_labels: string[];
  review_by: string | null;
  status: "active" | "retired";
}

export interface QuestionRow {
  id: string;
  format: "mc";
  category: string;
  stem: string;
  options: string[];
  correct: number;
  option_order: string;
  value_display: null;
  explanation: string;
  learn_more: string;
  review_by: string | null;
  status: "active" | "retired";
}

export interface RoundRow {
  type: string;
  difficulty: string | null;
  contentId: string;
}

export interface RoomPackRow {
  id: string;
  title: string;
  theme: string;
  question_ids: string[];
}

export interface ChallengePackRow {
  id: string;
  title: string;
  theme: string;
  rounds: RoundRow[];
}

export interface DailyRow {
  date: string;
  daily_number: number;
  rounds: RoundRow[];
  ready: boolean;
  spare_order: { spare: string; breaks: string[] }[];
}

export interface SpareRow {
  id: string;
  rounds: RoundRow[];
}

export interface ReleaseRows {
  /** Fixture releases only: main-track entities load from answer-entities.sql. */
  entities: EntityRow[];
  mysteries: MysteryRow[];
  encores: EncoreRow[];
  questions: QuestionRow[];
  roomPacks: RoomPackRow[];
  challengePacks: ChallengePackRow[];
  dailies: DailyRow[];
  spares: SpareRow[];
}

export interface Release extends ReleaseRows {
  track: Track;
  version: string;
  /** sha256 of every row, in load order: what content_releases records. */
  hash: string;
  /** Counts by table, as content_releases records them. */
  counts: Record<string, number>;
}

export interface BuildResult {
  release: Release | null;
  /** What keeps the release from being written. Messages name ids and fields only. */
  problems: ReportFinding[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Building a release
// ---------------------------------------------------------------------------

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function roundRows(rounds: readonly RoundRecord[]): RoundRow[] {
  return rounds.map((round) => ({
    type: round.type,
    difficulty: round.difficulty,
    contentId: round.contentId,
  }));
}

/**
 * The database status an item loads with, or null when it never loads. A
 * fixture is a draft that the e2e track plays as active (§5.6).
 */
function releasedStatus(
  status: string,
  fixtures: boolean,
): "active" | "retired" | null {
  if (status === "retired") return "retired";
  if (status === "active") return "active";
  return fixtures && status !== "cut" ? "active" : null;
}

function problem(
  rule: string,
  file: string,
  message: string,
  sealed: boolean,
  itemId?: string,
  path?: string,
): ReportFinding {
  const out: ReportFinding = {
    rule,
    severity: "error",
    file,
    message,
    sealed,
  };
  if (itemId !== undefined) out.itemId = itemId;
  if (path !== undefined) out.path = path;
  return out;
}

function contentRows(
  bank: Bank,
  fixtures: boolean,
  problems: ReportFinding[],
): Pick<ReleaseRows, "mysteries" | "encores" | "questions"> {
  const mysteries: MysteryRow[] = [];
  const encores: EncoreRow[] = [];
  const questions: QuestionRow[] = [];
  for (const record of [...bank.items].sort(byId)) {
    if (record.pool === "practice") continue;
    const status = releasedStatus(record.item.status, fixtures);
    if (status === null) continue;
    try {
      if (record.pool === "mystery") {
        const built = projectMystery(record.item as Mystery);
        mysteries.push({
          id: built.id,
          category: built.category,
          answer_type: built.answerType,
          answer_entity: built.answer,
          accepted_entities: built.accepted,
          clues: [...built.clues],
          distractors: [...built.distractors],
          slot: built.slot,
          explanation: built.explanation,
          learn_more: built.learnMore,
          source_labels: built.sourceLabels,
          review_by: built.reviewBy,
          status,
        });
      } else if (record.pool === "encore") {
        const built = projectEncore(record.item as Encore);
        encores.push({
          id: built.id,
          category: built.category,
          question: built.question,
          unit: built.unit,
          unit_short: built.unitShort,
          unit_label: built.unitLabel,
          value_kind: built.valueKind,
          answer: built.answer,
          decimals: built.decimals,
          bullseye: built.bands?.bullseye ?? null,
          close: built.bands?.close ?? null,
          explanation: built.explanation,
          learn_more: built.learnMore,
          source_labels: built.sourceLabels,
          review_by: built.reviewBy,
          status,
        });
      } else if (record.pool === "room") {
        const built = projectSealedChoice(record.item as RoomQuestion);
        questions.push({
          id: built.id,
          format: built.format,
          category: built.category,
          stem: built.stem,
          options: built.options,
          correct: built.correct,
          option_order: built.order,
          value_display: null,
          explanation: built.explanation,
          learn_more: built.learnMore,
          review_by: built.reviewBy,
          status,
        });
      }
    } catch (error) {
      problems.push(
        problem(
          "X18",
          record.file.rel,
          error instanceof ProjectionError
            ? error.message
            : "the item could not be converted to its released shape",
          record.file.sealed,
          record.id,
          error instanceof ProjectionError ? error.path : undefined,
        ),
      );
    }
  }
  return { mysteries, encores, questions };
}

function entityRows(
  bank: Bank,
  only: ReadonlySet<string> | null,
  problems: ReportFinding[],
): EntityRow[] {
  const rows: EntityRow[] = [];
  for (const type of ANSWER_TYPES) {
    const list = bank.lists.get(type);
    if (!list) continue;
    list.entities.forEach((entity) => {
      if (only !== null && !only.has(entity.id)) return;
      try {
        rows.push({
          answer_type: type,
          entity_id: entity.id,
          display: entity.display,
          option_label: optionLabelOf(type, entity),
          active: isShippedEntity(entity),
        });
      } catch (error) {
        problems.push(
          problem(
            "X18",
            list.file.rel,
            `${entity.id}: ${error instanceof ProjectionError ? error.message : "no option label"}`,
            false,
            undefined,
            error instanceof ProjectionError ? error.path : undefined,
          ),
        );
      }
    });
  }
  return rows;
}

function roomPackRows(
  bank: Bank,
  loaded: ReadonlySet<string>,
  notes: string[],
): RoomPackRow[] {
  const rows: RoomPackRow[] = [];
  for (const pack of [...bank.packs].sort(byId)) {
    if (NOT_HOSTABLE.has(pack.id)) continue;
    const missing = pack.questionIds.filter((id) => !loaded.has(id)).length;
    if (missing > 0) {
      notes.push(
        `Room pack ${pack.id} not released: ${missing} of its ${pack.questionIds.length} questions do not load.`,
      );
      continue;
    }
    rows.push({
      id: pack.id,
      title: pack.title,
      theme: pack.theme,
      question_ids: [...pack.questionIds],
    });
  }
  return rows;
}

/**
 * Ready for its date (CONTENT_GUIDE §9.9 rule 7): every item resolves,
 * carries a passing pass D for the date (or, for a spare set, with forDate
 * null) against the list versions that ship now, and none is due for
 * review on or before the date.
 */
export function readyOn(
  bank: Bank,
  day: ScheduleDay,
  date: string | null,
): boolean {
  const resolved = resolveDay(bank, day);
  if (resolved.items.some((item) => item.record === undefined)) return false;
  if (passD(bank, resolved, date, "").length > 0) return false;
  return (
    date === null ||
    resolved.items.every(
      ({ record }) =>
        record === undefined ||
        record.item.reviewBy === null ||
        date < record.item.reviewBy,
    )
  );
}

/** X13 (CONTENT_GUIDE §10.5) around one date: items within 365 days, mystery answers within 60. */
function repeatsAround(
  bank: Bank,
  days: readonly ScheduleDay[],
  date: string,
): number {
  const target = days.find((day) => day.date === date);
  if (!target) return 0;
  const here = resolveDay(bank, target);
  let found = 0;
  for (const other of days) {
    if (other.date === null || other.date === date) continue;
    const gap = Math.abs(daysBetween(other.date, date));
    if (gap >= 365) continue;
    for (const round of target.rounds) {
      if (other.rounds.some((r) => r.contentId === round.contentId)) found += 1;
    }
    if (gap < 60) {
      const there = resolveDay(bank, other);
      for (const mystery of here.mysteries) {
        if (there.mysteries.some((m) => m.answer === mystery.answer))
          found += 1;
      }
    }
  }
  return found;
}

function neighbourCounts(
  bank: Bank,
  days: readonly ScheduleDay[],
  date: string,
  spare: ScheduleDay | null,
  options: { epoch: string; compositions: unknown },
): Map<string, number> {
  const placed = days.map((day): ScheduleDay =>
    day.date === date && spare !== null
      ? {
          ...day,
          rounds: spare.rounds,
          predictedPoints: spare.predictedPoints,
          status: "assembled",
          spareOrder: undefined,
        }
      : { ...day, status: "assembled", spareOrder: undefined },
  );
  const near = placed.filter(
    (day) => day.date !== null && Math.abs(daysBetween(day.date, date)) <= 7,
  );
  const counts = new Map<string, number>();
  const add = (rule: string, n = 1) =>
    counts.set(rule, (counts.get(rule) ?? 0) + n);
  for (const finding of scheduleDayRules(bank, near, options))
    add(finding.rule);
  add("X13", repeatsAround(bank, placed, date));
  return counts;
}

/**
 * The rule codes a spare set would break at a date (CONTENT_GUIDE §10.7):
 * every rule with more findings around the date once the spare's rounds
 * replace the Daily's than before.
 */
export function spareBreaks(
  bank: Bank,
  days: readonly ScheduleDay[],
  date: string,
  spare: ScheduleDay,
  options: { epoch: string; compositions: unknown },
): string[] {
  const before = neighbourCounts(bank, days, date, null, options);
  const after = neighbourCounts(bank, days, date, spare, options);
  return [...after]
    .filter(([rule, count]) => count > (before.get(rule) ?? 0))
    .map(([rule]) => rule)
    .sort();
}

/** The e2e cycle (content/fixtures/README.md), as fixtureDailyFrom() plays it. */
export function cycleRounds(
  date: string,
  epoch: string,
  dated: ReadonlyMap<string, RoundRecord[]>,
  spares: readonly ScheduleDay[],
): RoundRecord[] | null {
  const dailyNumber = dailyNumberFor(date, epoch);
  if (dailyNumber === null) return null;
  const row = dated.get(date);
  if (row !== undefined) return row;
  return spares[(dailyNumber - 1) % spares.length]?.rounds ?? null;
}

export interface BuildOptions {
  bank: Bank;
  fixtures: boolean;
  /** src/config/shared.json dailyEpoch. */
  epoch: string;
  /** content/compositions.json, parsed. */
  compositions: unknown;
  /** The sealed challenge packs (none in the fixture tree). */
  challengePacks: readonly ChallengePack[];
  /** Fixtures: the dates the e2e cycle fills. */
  cycle?: { from: string; through: string };
  /**
   * Fixtures: only the items the Dailies and spare sets name, the entities
   * those mysteries name, and no room pack (the generated SQL test, kept
   * small enough for one execute_sql call beside the migration).
   */
  referencedOnly?: boolean;
  /** The version for a sealed release; a fixture release names itself from its hash. */
  version?: string;
}

export function buildRelease(options: BuildOptions): BuildResult {
  const { bank, fixtures, epoch } = options;
  const track: Track = fixtures ? "e2e" : "main";
  const problems: ReportFinding[] = [];
  const notes: string[] = [];
  const content = contentRows(bank, fixtures, problems);
  const challengePacks = options.challengePacks
    .filter((pack) => pack.track === track)
    .map((pack) => ({
      id: pack.id,
      title: pack.title,
      theme: pack.theme,
      rounds: roundRows(pack.rounds),
    }))
    .sort(byId);

  const { dailies: scheduled, spares: spareDays } = trackDays(bank, track);
  const dailies: DailyRow[] = [];
  const spares: SpareRow[] = [];
  if (fixtures) {
    const cycle = options.cycle ?? { from: E2E_FROM, through: E2E_THROUGH };
    const dated = new Map(
      scheduled.map((day) => [day.date ?? "", day.rounds] as const),
    );
    for (
      let date = cycle.from;
      date <= cycle.through;
      date = addDays(date, 1)
    ) {
      const rounds = cycleRounds(date, epoch, dated, spareDays);
      const dailyNumber = dailyNumberFor(date, epoch);
      if (rounds === null || dailyNumber === null) continue;
      dailies.push({
        date,
        daily_number: dailyNumber,
        rounds: roundRows(rounds),
        ready: true,
        spare_order: [],
      });
    }
    for (const day of spareDays)
      spares.push({
        id: day.spareId ?? day.label,
        rounds: roundRows(day.rounds),
      });
  } else {
    const spareById = new Map(spareDays.map((day) => [day.label, day]));
    const listed = spareDays.filter((day) => readyOn(bank, day, null));
    const unlisted = spareDays.length - listed.length;
    if (unlisted > 0)
      notes.push(
        `${unlisted} spare set(s) not released: an item has no passing pass D for a spare set (CONTENT_GUIDE §9.9 rule 7).`,
      );
    const ruleOptions = { epoch, compositions: options.compositions };
    for (const day of scheduled) {
      const date = day.date ?? "";
      const dailyNumber = dailyNumberFor(date, epoch);
      if (dailyNumber === null) {
        problems.push(
          problem(
            "X20",
            day.file,
            `${date}: a Daily before DAILY_EPOCH (${epoch})`,
            true,
          ),
        );
        continue;
      }
      dailies.push({
        date,
        daily_number: dailyNumber,
        rounds: roundRows(day.rounds),
        ready: readyOn(bank, day, date),
        spare_order: (day.spareOrder ?? []).flatMap((id) => {
          const spare = spareById.get(id);
          return spare === undefined
            ? []
            : [
                {
                  spare: id,
                  breaks: spareBreaks(
                    bank,
                    scheduled,
                    date,
                    spare,
                    ruleOptions,
                  ),
                },
              ];
        }),
      });
    }
    for (const day of listed)
      spares.push({ id: day.label, rounds: roundRows(day.rounds) });
  }
  spares.sort(byId);

  const referenced = new Set(
    [...dailies, ...spares].flatMap((day) =>
      day.rounds.map((r) => r.contentId),
    ),
  );
  const keep = <T extends { id: string }>(rows: T[]) =>
    options.referencedOnly === true
      ? rows.filter((row) => referenced.has(row.id))
      : rows;
  const mysteries = keep(content.mysteries);
  const encores = keep(content.encores);
  const questions = keep(content.questions);
  const named = new Set(
    mysteries.flatMap((m) => [
      m.answer_entity,
      ...m.accepted_entities,
      ...m.distractors,
    ]),
  );
  const entities = fixtures
    ? entityRows(bank, options.referencedOnly === true ? named : null, problems)
    : [];
  const roomPacks =
    options.referencedOnly === true
      ? []
      : roomPackRows(bank, new Set(questions.map((q) => q.id)), notes);

  if (problems.length > 0) return { release: null, problems, notes };
  const rows: ReleaseRows = {
    entities,
    mysteries,
    encores,
    questions,
    roomPacks,
    challengePacks,
    dailies,
    spares,
  };
  const hash = createHash("sha256")
    .update(JSON.stringify({ track, ...rows }), "utf8")
    .digest("hex");
  const counts: Record<string, number> = {
    ...(fixtures ? { answer_entities: entities.length } : {}),
    mysteries: mysteries.length,
    encores: encores.length,
    sealed_questions: questions.length,
    room_packs: roomPacks.length,
    challenge_packs: challengePacks.length,
    dailies: dailies.length,
    daily_spares: spares.length,
  };
  const version = fixtures
    ? `e2e-${hash.slice(0, 12)}`
    : (options.version ?? "");
  return {
    release: { ...rows, track, version, hash, counts },
    problems,
    notes,
  };
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

export interface Chunk {
  /** What the chunk loads, such as "mysteries" or "verify_release". */
  label: string;
  rows: number;
  sql: string;
}

const LOADERS: readonly {
  key: keyof Omit<ReleaseRows, "entities">;
  label: string;
  fn: string;
  frozen: boolean;
}[] = [
  {
    key: "mysteries",
    label: "mysteries",
    fn: "release_mysteries",
    frozen: true,
  },
  { key: "encores", label: "encores", fn: "release_encores", frozen: true },
  {
    key: "questions",
    label: "sealed questions",
    fn: "release_questions",
    frozen: true,
  },
  {
    key: "roomPacks",
    label: "room packs",
    fn: "release_room_packs",
    frozen: false,
  },
  {
    key: "challengePacks",
    label: "challenge packs",
    fn: "release_challenge_packs",
    frozen: true,
  },
  { key: "dailies", label: "Dailies", fn: "release_dailies", frozen: true },
  { key: "spares", label: "spare sets", fn: "release_spares", frozen: true },
];

const bytes = (text: string) => Buffer.byteLength(text, "utf8");

/** Splits rows into statements of at most `limit` bytes, each built by `statement`. */
function packed<T>(
  rows: readonly T[],
  limit: number,
  render: (row: T) => string,
  statement: (rendered: readonly string[]) => string,
): { sql: string; rows: number }[] {
  const out: { sql: string; rows: number }[] = [];
  const overhead = bytes(statement([]));
  let batch: string[] = [];
  let size = overhead;
  for (const row of rows) {
    const text = render(row);
    const extra = bytes(text) + 2;
    if (overhead + extra > limit)
      throw new Error(
        `a row alone is larger than the ${limit}-byte statement limit`,
      );
    if (batch.length > 0 && size + extra > limit) {
      out.push({ sql: statement(batch), rows: batch.length });
      batch = [];
      size = overhead;
    }
    batch.push(text);
    size += extra;
  }
  if (batch.length > 0) out.push({ sql: statement(batch), rows: batch.length });
  return out;
}

const literal = (value: unknown) => sqlText(JSON.stringify(value));

/** The release's statements, in the fixed order of §5.4. */
export function releaseChunks(
  release: Release,
  options: { chunkBytes?: number; allowFrozen?: boolean } = {},
): Chunk[] {
  const limit = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const v = sqlText(release.version);
  const t = sqlText(release.track);
  const chunks: Chunk[] = [];
  if (release.entities.length > 0) {
    for (const part of packed(
      release.entities,
      limit,
      (row) =>
        `  (${[row.answer_type, row.entity_id, row.display, row.option_label].map(sqlText).join(", ")}, ${row.active ? "true" : "false"})`,
      (values) =>
        [
          "insert into private.answer_entities (answer_type, entity_id, display, option_label, active)",
          "values",
          values.join(",\n"),
          "on conflict (answer_type, entity_id) do update",
          "  set display = excluded.display, option_label = excluded.option_label, active = excluded.active;",
        ].join("\n"),
    ))
      chunks.push({ label: "answer entities", ...part });
  }
  for (const loader of LOADERS) {
    const rows = release[loader.key] as readonly unknown[];
    if (rows.length === 0) continue;
    const frozen =
      loader.frozen && options.allowFrozen === true ? ", true" : "";
    for (const part of packed(
      rows,
      limit,
      (row) => JSON.stringify(row).replaceAll("'", "''"),
      (rendered) =>
        `select private.${loader.fn}(${v}, ${t}, '[${rendered.join(",")}]'::jsonb${frozen});`,
    ))
      chunks.push({ label: loader.label, ...part });
  }
  chunks.push({
    label: "verify_release",
    rows: 0,
    sql: `select private.verify_release(${v}, ${t});`,
  });
  chunks.push({
    label: "record_release",
    rows: 0,
    sql: `select private.record_release(${v}, ${t}, ${sqlText(release.hash)}, ${literal(release.counts)}::jsonb);`,
  });
  return chunks;
}

/** Why each chunk could not be sent unattended through the MCP (supabase/README.md §1). */
export function chunkProblems(
  chunks: readonly Chunk[],
  limit: number,
): string[] {
  const out: string[] = [];
  chunks.forEach((chunk, index) => {
    const at = `chunk ${index + 1} (${chunk.label})`;
    if (bytes(chunk.sql) > limit) out.push(`${at} is over ${limit} bytes`);
    for (const reason of mcpConfirmationReasons(chunk.sql))
      out.push(
        `${at}: the MCP would ask a human to confirm (${reason.split(" (")[0]})`,
      );
  });
  return out;
}

function chunkFile(
  header: readonly string[],
  chunks: readonly Chunk[],
): string {
  const out = [...header, ""];
  chunks.forEach((chunk, index) => {
    out.push(
      `-- ===== chunk ${index + 1}/${chunks.length}: ${chunk.label}${chunk.rows > 0 ? `, ${chunk.rows} row(s)` : ""}, ${(bytes(chunk.sql) / 1000).toFixed(1)} kB =====`,
      chunk.sql,
      "",
    );
  });
  return out.join("\n");
}

/** The sealed release file: git-ignored, sent chunk by chunk. */
export function releaseFile(
  release: Release,
  chunks: readonly Chunk[],
): string {
  return chunkFile(
    [
      `-- Content release ${release.version} for the ${release.track} track, written by npm run content:release (ARCHITECTURE §5.4).`,
      "-- Sealed: git-ignored, and pasted nowhere but the Supabase MCP's execute_sql.",
      "-- Send each chunk as its own execute_sql call, in order: content rows, then schedule rows, then",
      "-- verify_release, then record_release. Each chunk is one statement, so it applies or fails whole; a",
      "-- failed chunk leaves the release unrecorded, and sending the file again changes nothing.",
    ],
    chunks,
  );
}

/** supabase/seed/e2e-track.sql. */
export function e2eSeedFile(
  release: Release,
  chunks: readonly Chunk[],
): string {
  return chunkFile(
    [
      "-- Generated by `npm run content:release -- --fixtures` from content/fixtures/ (ARCHITECTURE §5.6, §8.17).",
      "-- Do not edit: scripts/content/release.test.ts regenerates it and fails on any difference.",
      `-- The e2e track, as release ${release.version}: the fixture answer entities and content, a Daily for`,
      `-- every date from ${E2E_FROM} to ${E2E_THROUGH} by the fixture cycle (content/fixtures/README.md), its`,
      "-- spare sets, then verify_release and the release record (SQL-3).",
      "-- Load it after supabase/seed/config.sql, practice-items.sql and answer-entities.sql, one statement",
      "-- per execute_sql call, in order. Loading it again changes nothing.",
    ],
    chunks,
  );
}

/** supabase/tests/content/fixture-release.test.sql: one week of the fixture release, then its rows. */
export function fixtureTestFile(
  release: Release,
  chunks: readonly Chunk[],
  options: {
    epoch: string;
    categories: readonly {
      id: string;
      slug: string;
      name: string;
      shortName: string;
    }[];
  },
): string {
  const ids = (rows: readonly { id: string }[]) =>
    rows.length === 0
      ? "'{}'::text[]"
      : `array[${rows.map((row) => sqlText(row.id)).join(", ")}]`;
  const expected = release.dailies.map((daily) => ({
    date: daily.date,
    number: daily.daily_number,
    composition: compositionIdOf(daily.rounds.map((r) => r.type as RoundType)),
    max: daily.rounds.reduce((sum, r) => sum + (MAX_POINTS[r.type] ?? 0), 0),
    rounds: daily.rounds,
  }));
  const used = new Set([
    ...release.mysteries.map((m) => m.category),
    ...release.encores.map((e) => e.category),
    ...release.questions.map((q) => q.category),
  ]);
  const categories = options.categories.filter((c) => used.has(c.id));
  const v = sqlText(release.version);
  return [
    "-- Generated by `npm run content:release -- --fixtures` from content/fixtures/ (SQL-3, ARCHITECTURE §5.4).",
    "-- Do not edit: scripts/content/release.test.ts regenerates it and fails on any difference.",
    `-- The fixture release applies with the expected rows, content before schedule: the ${release.dailies.length} e2e Dailies from`,
    `-- ${release.dailies[0]?.date ?? ""} (the AC-DLY-09 compositions among them) with the content they and the spare sets name,`,
    "-- the spare sets, verify_release and the release record, in the loaders' order, as supabase/seed/",
    "-- e2e-track.sql loads the whole track. Then the rows: compositions and maximum points as the",
    "-- engine computes them, Daily numbers from the epoch, the cycle dates playing their spare sets,",
    "-- and the record.",
    "begin;",
    `select private.t_now(${sqlText(FIXTURE_TEST_CLOCK)});`,
    `insert into private.config (key, value) values ('daily_epoch', ${sqlText(JSON.stringify(options.epoch))})`,
    "on conflict (key) do update set value = excluded.value;",
    "insert into private.categories (id, slug, name, short_name)",
    `values ${categories.map((c) => `(${[c.id, c.slug, c.name, c.shortName].map(sqlText).join(", ")})`).join(",\n       ")}`,
    "on conflict (id) do nothing;",
    ...chunks.map((chunk) => chunk.sql),
    "do $$",
    "begin",
    `  assert (select count(*) from private.mysteries m where m.track = 'e2e' and m.status = 'active'`,
    `           and m.id = any (${ids(release.mysteries)})) = ${release.mysteries.length}, 'the fixture mysteries';`,
    `  assert (select count(*) from private.encores e where e.track = 'e2e' and e.status = 'active'`,
    `           and e.id = any (${ids(release.encores)})) = ${release.encores.length}, 'the fixture encores';`,
    `  assert (select count(*) from private.sealed_questions q where q.track = 'e2e' and q.status = 'active'`,
    `           and q.id = any (${ids(release.questions)})) = ${release.questions.length}, 'the fixture questions';`,
    `  assert (select count(*) from private.room_packs p where p.track = 'e2e' and cardinality(p.question_ids) = 15`,
    `           and p.id = any (${ids(release.roomPacks)})) = ${release.roomPacks.length}, 'the hostable fixture room packs';`,
    "  assert not exists (select 1 from private.room_packs p where p.id = 'dly'), 'the Dailies'' choice rounds are no room pack';",
    `  assert (select jsonb_agg(jsonb_build_object('date', d.local_date, 'number', d.daily_number, 'composition', d.composition,`,
    `                                          'max', d.max_points, 'rounds', private.bare_rounds(d.rounds)) order by d.local_date)`,
    `            from private.dailies d where d.track = 'e2e' and d.release_version = ${v})`,
    `         = ${literal(expected)}::jsonb, 'the Dailies, their compositions, maximum points and numbers';`,
    `  assert (select count(*) from private.dailies d where d.track = 'e2e' and d.release_version = ${v}`,
    `           and d.daily_number = private.daily_number_for(d.local_date) and d.ready) = ${release.dailies.length},`,
    "    'the Daily numbers follow the epoch and every fixture Daily is ready';",
    `  assert (select count(*) from private.daily_spares s where s.track = 'e2e' and s.release_version = ${v} and s.active`,
    `           and s.id = any (${ids(release.spares)})) = ${release.spares.length}, 'the fixture spare sets';`,
    `  assert exists (select 1 from private.content_releases r where r.version = ${v} and r.track = 'e2e'`,
    `                  and r.content_hash = ${sqlText(release.hash)} and r.counts = ${literal(release.counts)}::jsonb),`,
    "    'the release record, written last';",
    "end",
    "$$;",
    "select 'PASS SQL-3 the fixture release applies in a dry run with the expected rows, content before schedule';",
    "rollback;",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Reading the sources
// ---------------------------------------------------------------------------

/** The sealed challenge packs, from the envelopes or the workspace. Invalid files are content:check's to report. */
export async function readChallengePacks(
  layout: Layout,
  sealed: boolean,
  keys: SealKeys | null,
): Promise<ChallengePack[]> {
  const dir = sealed
    ? layout.envelopeDir === null
      ? null
      : join(layout.envelopeDir, "challenge-packs")
    : join(layout.workspaceDir, "challenge-packs");
  if (dir === null || !existsSync(dir)) return [];
  const suffix = sealed ? ".json.enc" : ".json";
  const packs: ChallengePack[] = [];
  for (const name of (await readdir(dir))
    .filter((n) => n.endsWith(suffix))
    .sort()) {
    try {
      const raw = await readFile(join(dir, name), "utf8");
      let text = raw;
      if (sealed) {
        const envelope: unknown = JSON.parse(raw);
        if (keys === null || !isEnvelope(envelope)) continue;
        text = openEnvelope(keys, envelope).toString("utf8");
      }
      const parsed = ChallengePackSchema.safeParse(JSON.parse(text));
      if (parsed.success) packs.push(parsed.data);
    } catch {
      // content:check reports the file (C01), without its text.
    }
  }
  return packs;
}

function readJson(path: string): unknown {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as unknown)
    : null;
}

function sharedEpoch(repoRoot: string): string {
  const shared = (readJson(join(repoRoot, "src", "config", "shared.json")) ??
    {}) as { dailyEpoch?: unknown };
  if (typeof shared.dailyEpoch !== "string")
    throw new Error("src/config/shared.json has no dailyEpoch");
  return shared.dailyEpoch;
}

/** What content:check reports for a bank, as the release's gate: any error stops it. */
async function validate(
  bank: Bank,
  options: {
    sealed: boolean;
    keys: SealKeys | null;
    today: string;
    epoch: string;
    compositions: unknown;
  },
): Promise<{ findings: ReportFinding[]; notes: string[] }> {
  const notes: string[] = [];
  const findings: ReportFinding[] = [
    ...lintBank(bank, {
      sealed: options.sealed,
      today: options.today,
      dedupe: true,
    }),
    ...cnt1Findings(
      bank,
      {
        today: options.today,
        launch: false,
        epoch: options.epoch,
        compositions: options.compositions,
        histories: null,
        dedupe: true,
      },
      notes,
    ),
    ...(
      await sealedExtras(bank, {
        sealed: options.sealed,
        keys: options.keys,
        compositions: options.compositions,
      })
    ).findings,
  ];
  return { findings: findings.filter((f) => f.severity === "error"), notes };
}

export interface FixtureOutputs {
  seed: { path: string; content: string };
  test: { path: string; content: string };
  release: Release;
}

/** The fixture release, both outputs. Throws (with ids only) when the fixtures cannot release. */
export async function fixtureOutputs(
  repoRoot: string,
): Promise<FixtureOutputs> {
  const layout = resolveLayout({
    repoRoot,
    root: "content/fixtures",
    fixtures: true,
  });
  const bank = await loadBank(layout);
  const epoch = sharedEpoch(repoRoot);
  const compositions = readJson(join(repoRoot, "content", "compositions.json"));
  const { findings } = await validate(bank, {
    sealed: false,
    keys: null,
    today: E2E_FROM,
    epoch,
    compositions,
  });
  if (findings.length > 0) {
    throw new Error(
      `the fixtures do not validate: ${findings
        .slice(0, 5)
        .map((f) => `${f.itemId ?? f.file} ${f.rule}`)
        .join(", ")}`,
    );
  }
  const base = {
    bank,
    fixtures: true,
    epoch,
    compositions,
    challengePacks: [],
  };
  const full = buildRelease(base);
  const week = buildRelease({
    ...base,
    cycle: {
      from: FIXTURE_TEST_FROM,
      through: addDays(FIXTURE_TEST_FROM, FIXTURE_TEST_DAYS - 1),
    },
    referencedOnly: true,
  });
  if (full.release === null || week.release === null) {
    const first = [...full.problems, ...week.problems][0];
    throw new Error(
      `the fixtures do not release: ${first ? `${first.itemId ?? first.file} ${first.rule}` : "unknown"}`,
    );
  }
  const seedChunks = releaseChunks(full.release);
  const weekChunks = releaseChunks(week.release);
  const sendable = [
    ...chunkProblems(seedChunks, DEFAULT_CHUNK_BYTES),
    ...chunkProblems(weekChunks, DEFAULT_CHUNK_BYTES),
  ];
  if (sendable.length > 0) throw new Error(sendable.join("; "));
  const seed = e2eSeedFile(full.release, seedChunks);
  const test = fixtureTestFile(week.release, weekChunks, {
    epoch,
    categories: bank.categories,
  });
  const forbidden = [
    ...scanForbidden(E2E_SEED_PATH, seed),
    ...scanForbidden(FIXTURE_TEST_PATH, test),
  ];
  if (forbidden.length > 0)
    throw new Error(
      `the fixture release holds SQL the project never sends: ${forbidden
        .map((f) => `${f.file}:${f.line} ${f.rule}`)
        .join(", ")}`,
    );
  return {
    seed: { path: E2E_SEED_PATH, content: seed },
    test: { path: FIXTURE_TEST_PATH, content: test },
    release: full.release,
  };
}

/**
 * True when `path` may hold sealed SQL: outside any git work tree, or
 * ignored by git (supabase/.generated/ is, since CNT-0).
 */
export function safeToWrite(path: string): boolean {
  const dir = dirname(path);
  let probe = dir;
  while (!existsSync(probe)) probe = dirname(probe);
  const result = spawnSync("git", ["check-ignore", "-q", path], {
    cwd: probe,
    stdio: "ignore",
  });
  // 0: ignored; 1: a tracked or committable path; 128: not a git work tree.
  return result.status === 0 || result.status === 128;
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

const USAGE = `Usage:
  npm run content:release -- --version <n> [options]   the sealed release (needs the content key)
  npm run content:release -- --fixtures [--check]      the e2e track's seed and its SQL test

  --version <n>      The release version: letters, digits, '.', '_' or '-' (content_releases.version)
  --allow-frozen     Let the loaders change frozen Dailies and items on them, for a correction
  --out <file>       Write here instead of supabase/.generated/content-release-<n>.sql (git-ignored paths only)
  --chunk-kb <n>     The largest statement, in kB (default ${DEFAULT_CHUNK_BYTES / 1000})
  --today <date>     The date the validation rules read (default: today, UTC)
  --fixtures         Write ${E2E_SEED_PATH} and ${FIXTURE_TEST_PATH}
  --check            With --fixtures: compare with the committed files, write nothing
  --json             Machine-readable output`;

let sealedRun = false;

export async function main(argv: string[]): Promise<number> {
  const values = parseCli(
    "content:release",
    argv,
    {
      version: { type: "string" },
      "allow-frozen": { type: "boolean" },
      out: { type: "string" },
      "chunk-kb": { type: "string" },
      today: { type: "string" },
      fixtures: { type: "boolean" },
      check: { type: "boolean" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const repoRoot = findRepoRoot();
  const json = values.json === true;

  if (values.fixtures === true) {
    const outputs = await fixtureOutputs(repoRoot);
    const differ: string[] = [];
    for (const output of [outputs.seed, outputs.test]) {
      const abs = join(repoRoot, output.path);
      const current = existsSync(abs) ? readFileSync(abs, "utf8") : null;
      if (current === output.content) continue;
      differ.push(output.path);
      if (values.check !== true) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, output.content, "utf8");
      }
    }
    const { release } = outputs;
    const summary = `Fixture release ${release.version}: ${release.counts.dailies ?? 0} Dailies from ${E2E_FROM} to ${E2E_THROUGH}, ${release.counts.mysteries ?? 0} mysteries, ${release.counts.encores ?? 0} encores, ${release.counts.sealed_questions ?? 0} questions, ${release.counts.daily_spares ?? 0} spare sets.`;
    const failed = values.check === true && differ.length > 0;
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: !failed,
            version: release.version,
            counts: release.counts,
            [values.check === true ? "differ" : "written"]: differ,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`content:release: ${summary}`);
      for (const path of differ)
        console.log(
          values.check === true
            ? `differs  ${path}: run npm run content:release -- --fixtures`
            : `wrote    ${path}`,
        );
      if (differ.length === 0)
        console.log("content:release: both files are up to date.");
    }
    return failed ? 1 : 0;
  }

  const version = str(values, "version");
  if (
    version === undefined ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version)
  ) {
    console.error(
      `content:release: --version takes letters, digits, '.', '_' or '-'.\n\n${USAGE}`,
    );
    return 2;
  }
  const chunkKb = Number(str(values, "chunk-kb") ?? DEFAULT_CHUNK_BYTES / 1000);
  if (!(chunkKb >= 4 && chunkKb <= 400)) {
    console.error(
      "content:release: --chunk-kb is a number from 4 to 400 (§5.4 caps a call at 400 kB).",
    );
    return 2;
  }
  const plaintext = process.env.QZ_SEALED_PLAINTEXT === "1";
  sealedRun = !plaintext;
  const keys = plaintext
    ? null
    : ((await loadMasterKey(keySourceFromProcess()))?.keys ?? null);
  if (!plaintext && keys === null) {
    console.error(
      "content:release: no content key (QZ_CONTENT_KEY or ~/.config/quiz-web-app/content.key); nothing was written.",
    );
    return 1;
  }
  const layout = resolveLayout({ repoRoot });
  const bank = await loadBank(layout, { sealed: !plaintext, keys });
  const epoch = sharedEpoch(repoRoot);
  const compositions = readJson(join(repoRoot, "content", "compositions.json"));
  const today = str(values, "today") ?? todayUtc();
  const notes = [...bank.notes];
  const checked = await validate(bank, {
    sealed: !plaintext,
    keys,
    today,
    epoch,
    compositions,
  });
  notes.push(...checked.notes);
  const report = (findings: ReportFinding[], extra?: Record<string, unknown>) =>
    printReport(
      {
        command: "content:release",
        items: bank.items.length,
        findings,
        notes,
        ...(extra ? { extra } : {}),
      },
      { redact: sealedRun, reveal: false, json },
    );
  if (checked.findings.length > 0) {
    notes.push(
      "Nothing was written: the sealed content does not validate (npm run content:check -- --sealed).",
    );
    return report(checked.findings);
  }
  const challengePacks = await readChallengePacks(layout, !plaintext, keys);
  const built = buildRelease({
    bank,
    fixtures: false,
    epoch,
    compositions,
    challengePacks,
    version,
  });
  notes.push(...built.notes);
  if (built.release === null) {
    notes.push("Nothing was written.");
    return report(built.problems);
  }
  const release = built.release;
  const limit = Math.round(chunkKb * 1000);
  const chunks = releaseChunks(release, {
    chunkBytes: limit,
    allowFrozen: values["allow-frozen"] === true,
  });
  const unsendable = chunkProblems(chunks, limit);
  if (unsendable.length > 0) {
    notes.push(...unsendable, "Nothing was written.");
    return report([
      problem(
        "X18",
        "supabase/.generated",
        "a chunk cannot be sent unattended",
        true,
      ),
    ]);
  }
  const out = resolve(
    repoRoot,
    str(values, "out") ??
      join("supabase", ".generated", `content-release-${version}.sql`),
  );
  if (!safeToWrite(out)) {
    notes.push(
      `Nothing was written: ${relative(repoRoot, out)} is not git-ignored, and a release holds sealed plaintext.`,
    );
    return report([
      problem(
        "X18",
        relative(repoRoot, out),
        "the output path is not git-ignored",
        false,
      ),
    ]);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, releaseFile(release, chunks), {
    encoding: "utf8",
    mode: 0o600,
  });
  const total = chunks.reduce((sum, chunk) => sum + bytes(chunk.sql), 0);
  const ready = release.dailies.filter((daily) => daily.ready).length;
  notes.push(
    `Release ${version} for the ${release.track} track: ${release.counts.mysteries} mysteries, ${release.counts.encores} encores, ${release.counts.sealed_questions} questions, ${release.counts.room_packs} room packs, ${release.counts.challenge_packs} challenge packs, ${release.counts.dailies} Dailies (${ready} ready), ${release.counts.daily_spares} spare sets.`,
    `Wrote ${repoRelative(layout, out)}: ${chunks.length} chunk(s), ${(total / 1000).toFixed(1)} kB${values["allow-frozen"] === true ? ", frozen rows allowed" : ""}. Send each chunk with execute_sql, in order.`,
  );
  return report([], {
    version,
    track: release.track,
    counts: release.counts,
    ready,
    chunks: chunks.map((chunk) => ({
      label: chunk.label,
      rows: chunk.rows,
      bytes: bytes(chunk.sql),
    })),
  });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runReported(
    "content:release",
    () => sealedRun,
    () => main(process.argv.slice(2)),
  );
}
