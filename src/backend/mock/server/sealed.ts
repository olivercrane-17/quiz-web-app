/**
 * The mock sealed area (ARCHITECTURE §7.4, §8.4, §8.8): the Daily's attempts
 * judged the way SQL judges them, with the round plugins' judge halves, so
 * it is generic over round types: nothing here knows that v1 plays three
 * Mysteries and an Encore (§4.9).
 *
 * - `start({ kind: 'today' })` registers the device on its first write,
 *   resolves the effective today (§8.7), and returns the player's attempt
 *   for that Daily, finished or not (AC-DLY-05, AC-DLY-06), or creates a
 *   ranked one. A new attempt comes back with round 0 already open, and
 *   that start counts as round 0's `begin_round` (§8.4). The start also
 *   says whether the player has never finished a Daily (`firstDaily`, for
 *   the first-Daily hints of PRD §3.1.3 to §3.1.5).
 * - Every snapshot carries each resolved round's server interval and the
 *   open round's interval so far, to the second (PRD §4.1.4), so the
 *   stopwatch picks up where it was after a reload.
 * - `beginRound` opens the current round once the previous one resolved.
 *   Repeated calls return the same open state without moving its issue
 *   time or counting a request. A voided round never opens: it resolves at
 *   once as withdrawn, with the round's full points (4 for a Mystery, none
 *   for an Encore), and the next round's meta, or the finish.
 * - `act` follows round_action's order: the idempotency key first (it must
 *   be a v4 UUID, as `p_idem uuid` is; a key held by another attempt, round
 *   or intent is `conflict`; a known key returns the response rebuilt from
 *   the attempt's current state, a close or a mid-round void that landed
 *   since included), the window's close (the attempt converts to unranked
 *   archive), a voided
 *   current round (withdrawn instead of judged), the round and step (else
 *   `stale` with the current snapshot), the per-attempt cap, then the
 *   plugin's judge. Refusals consume nothing and store no key. The final
 *   round finishes the attempt in the same transaction.
 * - `get` and `finish` resolve a round voided while it was open, as SQL's
 *   get_attempt and finish_attempt do; `finish` is idempotent.
 *
 * The plugins' judge states are stored as JSON with the attempt, so a
 * reload, a second tab or a resync all judge against the same state.
 * Option shuffles come from the judge context's rng, forked as
 * `attempt:<id>:round:<n>` (§4.2), so they repeat for an attempt.
 *
 * `createAttempt`, `beginRoundIn`, `actIn` and `finishAttempt` are exported
 * for the areas that start other kinds of attempt (ARC-1's archive,
 * CHL-1's challenges) and for the scenarios in controls.ts; they run inside
 * the caller's write. STK-1 adds its streak update to FINISH_HOOKS.
 */
import type { BrowserContextKind } from "@/analytics/dictionary";
import { SHARED } from "@/config/shared";
import type {
  AnyRoundPlugin,
  EntityLookup,
  JudgeContext,
} from "@/engine/rounds";
import { outcomeFromReveal, outcomePoints } from "@/engine/run";
import { globalWindow, zoneOffsetMinutes } from "@/engine/time";
import {
  ROUND_FAMILY,
  parseIdempotencyKey,
  type AttemptId,
  type AttemptKind,
  type AttemptSnapshot,
  type BestMomentFacts,
  type CompositionId,
  type DailyNumber,
  type EncoreError,
  type EpochMs,
  type FinishSummary,
  type IdempotencyKey,
  type LocalDate,
  type PlayerId,
  type Result,
  type RoundFamily,
  type RoundIntent,
  type RoundMeta,
  type RoundOpen,
  type RoundOutcome,
  type RoundReveal,
  type RoundSpec,
  type RoundStart,
  type RoundVerdict,
  type TimeZone,
} from "@/engine/types";

import { fail, ok } from "../../errors";
import type { AppTag, BrowserContextInfo, SealedRunApi } from "../../types";
import type { MockContext } from "../context";
import {
  MOCK_TRACK,
  type FixtureDaily,
  type FixtureRoundContent,
} from "../fixtures";
import type { MockDb } from "../store";
import {
  authenticate,
  confirmRegistered,
  playerToday,
  resolveZone,
  type MockPlayerRow,
} from "./identity";

/** The methods this area really implements; the mock contract run skips the rest (§7.5). */
export const MOCK_CAPABILITIES: readonly (keyof SealedRunApi)[] = [
  "start",
  "get",
  "beginRound",
  "act",
  "finish",
];

/** One round of an attempt, as the mock keeps it (§8.3's packed state, unpacked). */
export interface MockRoundRow {
  spec: RoundSpec;
  meta: RoundMeta;
  /** The plugin's judge state, plain JSON; null until the round opens. */
  judge: unknown;
  /** What the player was last issued; null until the round begins. */
  open: RoundOpen | null;
  /** Server time of the round's first issue: its clue 1, stem or question. */
  issuedAt: EpochMs | null;
  resolvedAt: EpochMs | null;
  reveal: RoundReveal | null;
  outcome: RoundOutcome | null;
  /** `rq`: the round's begin plus each accepted state-changing action (§8.8). */
  requests: number;
  /** The largest hidden time an action reported for the round (`hm`). */
  hiddenMs: number;
  /** The client's own active time for the round, as last reported (`cms`). */
  clientMs: number;
}

/** One attempt (§8.3 `private.attempts`). */
export interface MockAttemptRow {
  id: AttemptId;
  playerId: PlayerId;
  kind: AttemptKind;
  track: string;
  dailyNumber: DailyNumber | null;
  /** The player's effective local date at start (§8.7). */
  localDate: LocalDate | null;
  ranked: boolean;
  /** The window's close turned it into an unranked archive run (§8.7). */
  converted: boolean;
  tz: TimeZone;
  offsetMin: number;
  context: BrowserContextKind;
  app: AppTag;
  appVersion: string;
  status: "active" | "finished" | "abandoned";
  startedAt: EpochMs;
  finishedAt: EpochMs | null;
  composition: CompositionId;
  /** The round being played, or the next one to begin. */
  current: number;
  rounds: MockRoundRow[];
  /** Accepted state-changing actions, against the per-attempt cap. */
  actions: number;
  points: number;
  summary: FinishSummary | null;
}

/** An idempotency key (§8.3 `private.round_actions`): no stored response, a replay rebuilds it. */
export interface MockRoundActionRow {
  attemptId: AttemptId;
  round: number;
  step: number;
  /** The intent, canonically encoded: the same key with another intent is `conflict`. */
  intent: string;
  at: EpochMs;
}

export interface SealedTables {
  attempts: Record<string, MockAttemptRow>;
  roundActions: Record<string, MockRoundActionRow>;
  /** Voided rounds per Daily, `<track>:<dailyNumber>` to round indexes (admin_void_round, §8.12). */
  voids: Record<string, number[]>;
  /** The id sequence, so ids never repeat across reloads and tabs. */
  sequence: { next: number };
}

export function sealedTables(db: MockDb): SealedTables {
  db.attempts ??= {};
  db.roundActions ??= {};
  db.voids ??= {};
  db.sequence ??= { next: 1 };
  return db as unknown as SealedTables;
}

function readAttempts(db: Readonly<MockDb>): Record<string, MockAttemptRow> {
  return (db.attempts ?? {}) as Record<string, MockAttemptRow>;
}

function readVoids(db: Readonly<MockDb>): Record<string, number[]> {
  return (db.voids ?? {}) as Record<string, number[]>;
}

const voidKey = (track: string, dailyNumber: number) =>
  `${track}:${dailyNumber}`;

/**
 * Voids a round of a Daily, as the owner's `admin_void_round` does
 * (PRD §3.13.4): every attempt that hasn't resolved it skips it from its
 * next call on. RPT-1 builds the rescoring of finished attempts.
 */
export async function voidRound(
  ctx: MockContext,
  options: { dailyNumber: number; round: number; track?: string },
): Promise<void> {
  await ctx.store.write(
    (db) => {
      const voids = sealedTables(db).voids;
      const key = voidKey(options.track ?? MOCK_TRACK, options.dailyNumber);
      const rounds = new Set(voids[key] ?? []);
      rounds.add(options.round);
      voids[key] = [...rounds].sort((a, b) => a - b);
    },
    ["voids"],
  );
}

function isVoided(
  db: Readonly<MockDb>,
  attempt: MockAttemptRow,
  index: number,
): boolean {
  if (attempt.dailyNumber === null) return false;
  const voided = readVoids(db)[voidKey(attempt.track, attempt.dailyNumber)];
  return voided?.includes(index) ?? false;
}

/** A v4 UUID from the mock's seeded stream: repeatable run to run, unique by sequence. */
export function nextUuid(ctx: MockContext, db: MockDb, label: string): string {
  const sequence = sealedTables(db).sequence;
  const rng = ctx.rng.fork(`${label}:${sequence.next}`);
  sequence.next += 1;
  const bytes = Array.from({ length: 16 }, () => rng.int(256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pluginOf(ctx: MockContext, meta: RoundMeta): AnyRoundPlugin {
  return ctx.plugins[meta.type];
}

/** The step a call must name (§7.2): the clue number on a Mystery, else 1. */
export function stepOf(open: RoundOpen): number {
  return open.family === "mystery" ? open.clue : 1;
}

/** One canonical spelling per intent, so a reused key is compared by meaning. */
function encodeIntent(intent: RoundIntent): string {
  const record = intent as unknown as Record<string, unknown>;
  return JSON.stringify(record, Object.keys(record).sort());
}

const CONTENT_KIND: Readonly<Record<RoundFamily, string>> = {
  mystery: "mystery",
  encore: "encore",
  choice: "choice",
  ordering: "ordering",
};

/** The sealed content of a round; a missing or mismatched item is a content bug. */
async function contentFor(
  ctx: MockContext,
  spec: RoundSpec,
): Promise<FixtureRoundContent> {
  const content = await ctx.content.round(spec.contentId);
  if (content === null) {
    throw new Error(`mock: no content for round ${spec.contentId}`);
  }
  const kind = (content as { kind?: unknown }).kind;
  if (kind !== undefined && kind !== CONTENT_KIND[ROUND_FAMILY[spec.type]]) {
    throw new Error(
      `mock: ${spec.contentId} is ${String(kind)} content in a ${spec.type} round`,
    );
  }
  return content;
}

/** What a round's judge needs: its content and, for a Mystery, its answer list. */
export async function loadRound(
  ctx: MockContext,
  row: Pick<MockRoundRow, "spec" | "meta">,
): Promise<{ content: FixtureRoundContent; entities: EntityLookup | null }> {
  const content = await contentFor(ctx, row.spec);
  const entities =
    row.meta.answerType === null
      ? null
      : await ctx.content.entities(row.meta.answerType);
  return { content, entities };
}

function judgeContext(
  ctx: MockContext,
  attempt: MockAttemptRow,
  index: number,
  at: EpochMs,
  entities: EntityLookup | null,
): JudgeContext {
  return {
    at,
    rng: ctx.rng.fork(`attempt:${attempt.id}:round:${index}`),
    shuffle: null,
    optionsFromClue: ctx.rules.optionsFromClue,
    entities,
  };
}

/** Public round facts (§3.3): never a key, never a content id. */
function buildMetas(
  ctx: MockContext,
  rounds: readonly RoundSpec[],
  contents: readonly FixtureRoundContent[],
  voided: ReadonlySet<number>,
): RoundMeta[] {
  const families = rounds.map((spec) => ROUND_FAMILY[spec.type]);
  return rounds.map((spec, index) => {
    const family = families[index] as RoundFamily;
    const content = contents[index] as FixtureRoundContent;
    const category =
      family === "encore" ? null : (content as { category?: unknown }).category;
    const answerType =
      family === "mystery"
        ? (content as { answerType?: unknown }).answerType
        : null;
    const meta: RoundMeta = {
      index,
      type: spec.type,
      difficulty: spec.difficulty,
      category: (category ?? null) as RoundMeta["category"],
      answerType: (answerType ?? null) as RoundMeta["answerType"],
      ordinal: families.slice(0, index + 1).filter((f) => f === family).length,
      ofType: families.filter((f) => f === family).length,
      maxPoints: 0,
      voided: voided.has(index),
    };
    return { ...meta, maxPoints: ctx.plugins[spec.type].maxPoints(meta) };
  });
}

/** A round's meta with its void flag as it stands now. */
function currentMeta(
  db: Readonly<MockDb>,
  attempt: MockAttemptRow,
  index: number,
): RoundMeta | null {
  const row = attempt.rounds[index];
  if (row === undefined) return null;
  const voided = row.meta.voided || isVoided(db, attempt, index);
  return voided === row.meta.voided ? row.meta : { ...row.meta, voided };
}

/**
 * A round time as the snapshot carries it: to the whole second, which is
 * all the stopwatch shows, so a time can never match a sealed value by
 * chance in the payload scans (AC-DLY-04's matching rules).
 */
function toSecond(ms: number): number {
  return Math.round(ms / 1000) * 1000;
}

/** The open round's server interval so far, from its first issue (PRD §4.1.4), capped. */
function openRoundMs(row: MockRoundRow, now: EpochMs): number {
  if (row.issuedAt === null || row.open === null) return 0;
  return toSecond(Math.min(Math.max(0, now - row.issuedAt), SHARED.roundCapMs));
}

/** The attempt as the client may see it (§3.4): reveals only for resolved rounds. */
export function snapshotOf(
  db: Readonly<MockDb>,
  attempt: MockAttemptRow,
  now: EpochMs,
): AttemptSnapshot {
  const rounds = attempt.rounds.map(
    (_, index) => currentMeta(db, attempt, index) as RoundMeta,
  );
  const resolved = attempt.rounds.flatMap((row, index) =>
    row.reveal === null || row.outcome === null
      ? []
      : [
          {
            meta: rounds[index] as RoundMeta,
            outcome: row.outcome,
            reveal: row.reveal,
            // What the round counts toward total time, so the stopwatch
            // survives a reload (R1-06).
            activeMs: toSecond(effectiveRoundMs(row)),
          },
        ],
  );
  const currentRow = attempt.rounds[attempt.current];
  return {
    attemptId: attempt.id,
    kind: attempt.kind,
    ranked: attempt.ranked,
    daily:
      attempt.dailyNumber === null || attempt.localDate === null
        ? null
        : { dailyNumber: attempt.dailyNumber, date: attempt.localDate },
    composition: attempt.composition,
    rounds,
    maxPoints: rounds.reduce((sum, meta) => sum + meta.maxPoints, 0),
    resolved,
    current:
      attempt.status === "active" && currentRow !== undefined
        ? {
            index: attempt.current,
            open: currentRow.open,
            ...(currentRow.open === null
              ? {}
              : { activeMs: openRoundMs(currentRow, now) }),
          }
        : null,
    status: attempt.status,
    points: attempt.points,
    startedAt: attempt.startedAt,
    serverTime: now,
  };
}

/** The caller's attempt, or null: another player's attempt is `not_found` (§8.4). */
function ownAttempt(
  db: MockDb,
  player: MockPlayerRow,
  attemptId: AttemptId,
): MockAttemptRow | null {
  const attempt = sealedTables(db).attempts[attemptId];
  return attempt !== undefined && attempt.playerId === player.id
    ? attempt
    : null;
}

/** The player's attempt at a Daily, whatever its kind or status: one per date. */
export function attemptFor(
  db: Readonly<MockDb>,
  playerId: PlayerId,
  dailyNumber: number,
  track: string = MOCK_TRACK,
): MockAttemptRow | null {
  return (
    Object.values(readAttempts(db)).find(
      (attempt) =>
        attempt.playerId === playerId &&
        attempt.track === track &&
        attempt.dailyNumber === dailyNumber,
    ) ?? null
  );
}

/** Every attempt in the store, for the areas that count or list them. */
export function allAttempts(db: Readonly<MockDb>): MockAttemptRow[] {
  return Object.values(readAttempts(db));
}

/**
 * True until the player has finished a Daily other than `attempt`: the
 * first-Daily hints (PRD §3.1.3 to §3.1.5) show once per player, for the
 * whole of their first Daily, a reload included.
 */
export function isFirstDaily(
  db: Readonly<MockDb>,
  attempt: MockAttemptRow,
): boolean {
  return !allAttempts(db).some(
    (other) =>
      other.id !== attempt.id &&
      other.playerId === attempt.playerId &&
      other.status === "finished" &&
      other.dailyNumber !== null,
  );
}

/**
 * What start() answers: the attempt, and whether the player has never
 * finished a Daily (`firstDaily`), which the first-Daily hints read. The
 * flag rides beside the snapshot's own fields until ARCHITECTURE §3.4
 * names it, for SQL-4's start_daily to return as well.
 */
export type StartedSnapshot = AttemptSnapshot & { firstDaily: boolean };

/**
 * After its date's global window closes, a ranked attempt converts in place
 * before anything is judged: unranked, kind archive, its rounds kept (§8.7).
 */
function convertIfClosed(attempt: MockAttemptRow, now: EpochMs): boolean {
  if (
    attempt.status === "active" &&
    attempt.ranked &&
    attempt.localDate !== null &&
    now >= globalWindow(attempt.localDate).closesAt
  ) {
    attempt.ranked = false;
    attempt.kind = "archive";
    attempt.converted = true;
  }
  return attempt.converted;
}

const stale = (db: Readonly<MockDb>, attempt: MockAttemptRow, now: EpochMs) =>
  fail("stale", { current: snapshotOf(db, attempt, now) });

/** A finish hook: runs inside the finishing write and may refine the summary. */
export type FinishHook = (
  ctx: MockContext,
  db: MockDb,
  attempt: MockAttemptRow,
  summary: FinishSummary,
) => FinishSummary;

/**
 * Run in order on every finish, as SQL's hook chain after
 * finish_attempt_internal (§8.8). STK-1 adds the streak update here
 * (`summary.streak`), later tickets their own.
 */
export const FINISH_HOOKS: FinishHook[] = [];

/** A round's effective time (§4.6): the latency allowance applied, capped. */
function effectiveRoundMs(row: MockRoundRow): number {
  if (row.issuedAt === null || row.resolvedAt === null || row.outcome?.voided) {
    return 0;
  }
  const serverMs = row.resolvedAt - row.issuedAt;
  const allowed = Math.max(
    serverMs - SHARED.latencyAllowanceMs * row.requests,
    row.clientMs,
    0,
  );
  return Math.min(allowed, SHARED.roundCapMs);
}

function bestMomentFacts(
  db: Readonly<MockDb>,
  attempt: MockAttemptRow,
  maxPoints: number,
): BestMomentFacts {
  const earlier = allAttempts(db).filter(
    (other) =>
      other.id !== attempt.id &&
      other.playerId === attempt.playerId &&
      other.status === "finished" &&
      other.dailyNumber !== null,
  );
  const outcomes = attempt.rounds.flatMap((row) =>
    row.outcome === null ? [] : [{ meta: row.meta, outcome: row.outcome }],
  );
  const best = Math.max(-1, ...earlier.map((other) => other.points));
  return {
    perfect: maxPoints > 0 && attempt.points === maxPoints,
    newBestScore: earlier.length >= 3 && attempt.points > best,
    firstFinish: earlier.length === 0,
    milestone: null,
    freezeEarned: false,
    hardestSolvedOnClue1: outcomes.some(
      ({ meta, outcome }) =>
        outcome.family === "mystery" &&
        meta.difficulty === "hard" &&
        outcome.solvedOn === 1,
    ),
    bullseye: outcomes.some(
      ({ outcome }) =>
        outcome.family === "encore" &&
        !outcome.voided &&
        outcome.band === "bullseye",
    ),
    earlierFinishes: earlier.length,
  };
}

/**
 * finish_attempt_internal (§8.8): points, total time, the Encore's error,
 * the best-moment facts, status `finished`, then the hook chain. Idempotent.
 */
export function finishAttempt(
  ctx: MockContext,
  db: MockDb,
  attempt: MockAttemptRow,
  now: EpochMs,
): FinishSummary {
  if (attempt.status === "finished" && attempt.summary !== null) {
    return attempt.summary;
  }
  const maxPoints = attempt.rounds.reduce(
    (sum, row) => sum + row.meta.maxPoints,
    0,
  );
  const encore = attempt.rounds
    .map((row) => row.outcome)
    .find(
      (outcome): outcome is Extract<RoundOutcome, { family: "encore" }> =>
        outcome?.family === "encore",
    );
  const encoreError: EncoreError | null =
    encore === undefined || encore.voided ? null : encore.error;
  attempt.status = "finished";
  attempt.finishedAt = now;
  attempt.current = Math.max(0, attempt.rounds.length - 1);
  let summary: FinishSummary = {
    attemptId: attempt.id,
    points: attempt.points,
    maxPoints,
    encore: encoreError,
    totalMs: attempt.rounds.reduce(
      (sum, row) => sum + effectiveRoundMs(row),
      0,
    ),
    ranked: attempt.ranked,
    streak: null,
    facts: bestMomentFacts(db, attempt, maxPoints),
  };
  for (const hook of FINISH_HOOKS) summary = hook(ctx, db, attempt, summary);
  attempt.summary = summary;
  return summary;
}

/** After round `index` resolves: the next round becomes current, or the attempt finishes. */
function advance(
  ctx: MockContext,
  db: MockDb,
  attempt: MockAttemptRow,
  index: number,
  now: EpochMs,
): FinishSummary | null {
  if (index >= attempt.rounds.length - 1) {
    return finishAttempt(ctx, db, attempt, now);
  }
  attempt.current = index + 1;
  return null;
}

function resolveRound(
  attempt: MockAttemptRow,
  row: MockRoundRow,
  meta: RoundMeta,
  reveal: RoundReveal,
  now: EpochMs,
): void {
  const outcome = outcomeFromReveal(meta, reveal);
  row.meta = meta;
  row.reveal = reveal;
  row.outcome = outcome;
  row.resolvedAt = now;
  attempt.points += outcomePoints(outcome);
}

/** A voided round resolves as withdrawn (PRD §3.13.4), unjudged, with its full points. */
function withdraw(
  ctx: MockContext,
  db: MockDb,
  attempt: MockAttemptRow,
  index: number,
  now: EpochMs,
): {
  reveal: Extract<RoundReveal, { family: "withdrawn" }>;
  next: RoundMeta | null;
  finished: FinishSummary | null;
} {
  const row = attempt.rounds[index] as MockRoundRow;
  const meta: RoundMeta = { ...row.meta, voided: true };
  const reveal: Extract<RoundReveal, { family: "withdrawn" }> = {
    family: "withdrawn",
    round: ROUND_FAMILY[meta.type],
    points: meta.maxPoints,
    maxPoints: meta.maxPoints,
  };
  resolveRound(attempt, row, meta, reveal, now);
  const finished = advance(ctx, db, attempt, index, now);
  return { reveal, next: currentMeta(db, attempt, index + 1), finished };
}

/** Withdraws a voided round that is current and unresolved, as every RPC does first. */
function withdrawIfVoided(
  ctx: MockContext,
  db: MockDb,
  attempt: MockAttemptRow,
  now: EpochMs,
  options: { onlyIfOpen: boolean },
): ReturnType<typeof withdraw> | null {
  const index = attempt.current;
  const row = attempt.rounds[index];
  if (
    attempt.status !== "active" ||
    row === undefined ||
    row.reveal !== null ||
    (options.onlyIfOpen && row.open === null) ||
    !isVoided(db, attempt, index)
  ) {
    return null;
  }
  return withdraw(ctx, db, attempt, index, now);
}

/**
 * begin_round for the current round (§8.4), inside the caller's write. A
 * voided round resolves at once; an open one comes back as it was issued.
 */
export async function beginRoundIn(
  ctx: MockContext,
  db: MockDb,
  attempt: MockAttemptRow,
  index: number,
  now: EpochMs,
): Promise<{ start: RoundStart; finished: FinishSummary | null }> {
  const row = attempt.rounds[index] as MockRoundRow;
  if (row.reveal === null && isVoided(db, attempt, index)) {
    const withdrawn = withdraw(ctx, db, attempt, index, now);
    return {
      start: {
        kind: "withdrawn",
        reveal: withdrawn.reveal,
        next: withdrawn.next,
      },
      finished: withdrawn.finished,
    };
  }
  if (row.open !== null) {
    return { start: { kind: "open", open: row.open }, finished: null };
  }
  const { content, entities } = await loadRound(ctx, row);
  const { open, judge } = pluginOf(ctx, row.meta).open(
    content,
    row.meta,
    judgeContext(ctx, attempt, index, now, entities),
  );
  row.open = open;
  row.judge = judge;
  row.issuedAt = now;
  row.requests = 1;
  return { start: { kind: "open", open }, finished: null };
}

export interface CreateAttemptOptions {
  kind: AttemptKind;
  daily: FixtureDaily;
  ranked: boolean;
  player: MockPlayerRow;
  zone: TimeZone;
  browser: BrowserContextInfo;
  appVersion: string;
}

/**
 * Creates an attempt and opens its round 0 in the same transaction, so the
 * snapshot carries the first clue or stem (§8.4). The caller has checked
 * that the player has no attempt at this Daily.
 */
export async function createAttempt(
  ctx: MockContext,
  db: MockDb,
  options: CreateAttemptOptions,
): Promise<MockAttemptRow> {
  const now = ctx.clock.now();
  const { daily } = options;
  const contents = await Promise.all(
    daily.rounds.map((spec) => contentFor(ctx, spec)),
  );
  const voided = new Set(
    readVoids(db)[voidKey(MOCK_TRACK, daily.daily.dailyNumber)] ?? [],
  );
  const metas = buildMetas(ctx, daily.rounds, contents, voided);
  const attempt: MockAttemptRow = {
    id: nextUuid(ctx, db, "attempt") as AttemptId,
    playerId: options.player.id,
    kind: options.kind,
    track: MOCK_TRACK,
    dailyNumber: daily.daily.dailyNumber,
    localDate: daily.daily.date,
    ranked: options.ranked,
    converted: false,
    tz: options.zone,
    offsetMin: zoneOffsetMinutes(now, options.zone),
    context: options.browser.context,
    app: options.browser.app,
    appVersion: options.appVersion.slice(0, 48),
    status: "active",
    startedAt: now,
    finishedAt: null,
    composition: daily.composition,
    current: 0,
    rounds: metas.map((meta, index) => ({
      spec: daily.rounds[index] as RoundSpec,
      meta,
      judge: null,
      open: null,
      issuedAt: null,
      resolvedAt: null,
      reveal: null,
      outcome: null,
      requests: 0,
      hiddenMs: 0,
      clientMs: 0,
    })),
    actions: 0,
    points: 0,
    summary: null,
  };
  sealedTables(db).attempts[attempt.id] = attempt;
  if (attempt.rounds.length === 0) {
    finishAttempt(ctx, db, attempt, now);
  } else {
    await beginRoundIn(ctx, db, attempt, 0, now);
  }
  return attempt;
}

/** What act() answers. */
export interface ActResponse {
  verdict: RoundVerdict;
  finished: FinishSummary | null;
  converted: boolean;
  serverTime: EpochMs;
}

/** A known key's answer, rebuilt from the attempt as it stands (§8.8). */
function rebuild(
  db: Readonly<MockDb>,
  attempt: MockAttemptRow,
  round: number,
  now: EpochMs,
): Result<ActResponse> {
  const row = attempt.rounds[round];
  if (row === undefined) return stale(db, attempt, now);
  const finished = attempt.status === "finished" ? attempt.summary : null;
  if (row.reveal !== null) {
    return ok({
      verdict: {
        kind: "resolved",
        reveal: row.reveal,
        next: currentMeta(db, attempt, round + 1),
      },
      finished,
      converted: attempt.converted,
      serverTime: now,
    });
  }
  if (row.open === null) return stale(db, attempt, now);
  return ok({
    verdict: { kind: "continue", open: row.open },
    finished: null,
    converted: attempt.converted,
    serverTime: now,
  });
}

export interface ActInput {
  index: number;
  step: number;
  intent: RoundIntent;
  clientActiveMs: number;
  hiddenMs: number;
  key: IdempotencyKey;
}

/** round_action (§8.4) on an attempt the caller owns, inside the caller's write. */
export async function actIn(
  ctx: MockContext,
  db: MockDb,
  attempt: MockAttemptRow,
  input: ActInput,
): Promise<Result<ActResponse>> {
  const now = ctx.clock.now();
  // SQL's p_idem is a uuid: anything else is refused before it is looked up
  // or stored, and case never makes two keys of one.
  const key = parseIdempotencyKey(input.key);
  if (key === null) return fail("invalid_input");
  const tables = sealedTables(db);
  const intent = encodeIntent(input.intent);
  const known = Object.hasOwn(tables.roundActions, key)
    ? tables.roundActions[key]
    : undefined;
  if (known !== undefined) {
    if (
      known.attemptId !== attempt.id ||
      known.round !== input.index ||
      known.intent !== intent
    ) {
      return fail("conflict");
    }
    // Rebuilt from the attempt as it stands now (§8.8), so the replay also
    // carries a close or a mid-round void that landed after the key. A
    // later round that hasn't opened yet is left for begin_round.
    convertIfClosed(attempt, now);
    withdrawIfVoided(ctx, db, attempt, now, { onlyIfOpen: true });
    return rebuild(db, attempt, known.round, now);
  }
  const converted = convertIfClosed(attempt, now);
  if (attempt.status !== "active") return stale(db, attempt, now);
  const remember = (round: number, step: number) => {
    tables.roundActions[key] = {
      attemptId: attempt.id,
      round,
      step,
      intent,
      at: now,
    };
  };

  const voidedIndex = attempt.current;
  const voided = withdrawIfVoided(ctx, db, attempt, now, { onlyIfOpen: false });
  if (voided !== null && voidedIndex === input.index) {
    // The withdrawal answers in place of a verdict (PRD §3.13.4), and a
    // replay of the key rebuilds it.
    remember(voidedIndex, input.step);
    return ok({
      verdict: { kind: "resolved", reveal: voided.reveal, next: voided.next },
      finished: voided.finished,
      converted,
      serverTime: now,
    });
  }

  const row = attempt.rounds[input.index];
  if (
    input.index !== attempt.current ||
    row === undefined ||
    row.open === null ||
    row.reveal !== null ||
    input.step !== stepOf(row.open)
  ) {
    return stale(db, attempt, now);
  }
  if (attempt.actions >= ctx.rules.actionsPerAttempt) {
    return fail("rate_limited", { retryAfterMs: 60_000, limitScope: "player" });
  }
  const plugin = pluginOf(ctx, row.meta);
  if (input.intent.family !== plugin.family) return fail("invalid_input");
  if (
    !Number.isFinite(input.clientActiveMs) ||
    !Number.isFinite(input.hiddenMs) ||
    input.clientActiveMs < 0 ||
    input.hiddenMs < 0
  ) {
    return fail("invalid_input");
  }

  const { content, entities } = await loadRound(ctx, row);
  const judged = plugin.judge(
    content,
    row.judge,
    input.intent,
    judgeContext(ctx, attempt, input.index, now, entities),
  );
  if (!judged.ok) {
    // Refusals consume nothing and store no key (§8.4).
    return judged.error === "stale"
      ? stale(db, attempt, now)
      : fail(judged.error);
  }

  remember(input.index, input.step);
  attempt.actions += 1;
  row.judge = judged.judge;
  row.requests += 1;
  row.hiddenMs = Math.max(row.hiddenMs, Math.round(input.hiddenMs));
  row.clientMs = Math.round(input.clientActiveMs);
  const verdict = judged.verdict;
  if (verdict.kind === "continue") {
    row.open = verdict.open;
    return ok({ verdict, finished: null, converted, serverTime: now });
  }
  resolveRound(attempt, row, row.meta, verdict.reveal, now);
  const finished = advance(ctx, db, attempt, input.index, now);
  return ok({
    // Plugins leave the next round's meta to the sealed layer (§4.4).
    verdict: {
      kind: "resolved",
      reveal: verdict.reveal,
      next: currentMeta(db, attempt, input.index + 1),
    },
    finished,
    converted,
    serverTime: now,
  });
}

/** The parts of a start the client controls. */
export interface StartDailyOptions {
  player: MockPlayerRow;
  tz: string;
  browser: BrowserContextInfo;
  appVersion: string;
}

/**
 * start_daily (§8.4) for a player, inside the caller's write: the existing
 * attempt for the effective today's Daily, or a new ranked one.
 */
export async function startDaily(
  ctx: MockContext,
  db: MockDb,
  options: StartDailyOptions,
): Promise<Result<MockAttemptRow>> {
  const now = ctx.clock.now();
  const zone = resolveZone(options.tz, options.player);
  const today = playerToday(options.player, zone, now, { record: true });
  const daily = await ctx.content.daily(today);
  if (daily === null) return fail("no_daily");
  const existing = attemptFor(db, options.player.id, daily.daily.dailyNumber);
  if (existing !== null) return ok(existing);
  const attempt = await createAttempt(ctx, db, {
    kind: "daily",
    daily,
    ranked: true,
    player: options.player,
    zone,
    browser: options.browser,
    appVersion: options.appVersion,
  });
  return ok(attempt);
}

const TABLES = ["players", "credentials", "attempts", "roundActions"] as const;

export function createSealedArea(ctx: MockContext): SealedRunApi {
  return {
    async start(source, startCtx) {
      if (source.kind !== "today") {
        // Archive (ARC-1), challenge (CHL-1), pack and quiz starts arrive
        // with their tickets, through createAttempt.
        return fail("unavailable");
      }
      const result = await ctx.store.write(
        async (db): Promise<Result<AttemptSnapshot>> => {
          const auth = authenticate(ctx, db, {
            register: true,
            browser: startCtx.browser,
          });
          if (!auth.ok) return auth.result;
          const started = await startDaily(ctx, db, {
            player: auth.player,
            tz: startCtx.tz,
            browser: startCtx.browser,
            appVersion: startCtx.appVersion,
          });
          if (!started.ok) return started;
          const attempt = started.value;
          const now = ctx.clock.now();
          convertIfClosed(attempt, now);
          withdrawIfVoided(ctx, db, attempt, now, { onlyIfOpen: true });
          return ok<StartedSnapshot>({
            ...snapshotOf(db, attempt, now),
            firstDaily: isFirstDaily(db, attempt),
          });
        },
        TABLES,
      );
      if (result.ok) confirmRegistered(ctx);
      return result;
    },

    get(attemptId) {
      return ctx.store.write((db): Result<AttemptSnapshot> => {
        const auth = authenticate(ctx, db, { register: false });
        if (!auth.ok) return auth.result;
        const attempt = ownAttempt(db, auth.player, attemptId);
        if (attempt === null) return fail("not_found");
        const now = ctx.clock.now();
        convertIfClosed(attempt, now);
        withdrawIfVoided(ctx, db, attempt, now, { onlyIfOpen: true });
        return ok(snapshotOf(db, attempt, now));
      }, TABLES);
    },

    beginRound(attemptId, index) {
      return ctx.store.write(async (db) => {
        const auth = authenticate(ctx, db, { register: false });
        if (!auth.ok) return auth.result;
        const attempt = ownAttempt(db, auth.player, attemptId);
        if (attempt === null) return fail("not_found");
        const now = ctx.clock.now();
        const converted = convertIfClosed(attempt, now);
        const previous = attempt.rounds[index - 1];
        if (
          attempt.status !== "active" ||
          index !== attempt.current ||
          attempt.rounds[index] === undefined ||
          (index > 0 && previous?.reveal === null)
        ) {
          return stale(db, attempt, now);
        }
        const { start, finished } = await beginRoundIn(
          ctx,
          db,
          attempt,
          index,
          now,
        );
        return ok({ start, finished, converted, serverTime: now });
      }, TABLES);
    },

    act(input) {
      return ctx.store.write(async (db): Promise<Result<ActResponse>> => {
        const auth = authenticate(ctx, db, { register: false });
        if (!auth.ok) return auth.result;
        const attempt = ownAttempt(db, auth.player, input.attemptId);
        if (attempt === null) return fail("not_found");
        return actIn(ctx, db, attempt, input);
      }, TABLES);
    },

    finish(attemptId) {
      return ctx.store.write((db): Result<FinishSummary> => {
        const auth = authenticate(ctx, db, { register: false });
        if (!auth.ok) return auth.result;
        const attempt = ownAttempt(db, auth.player, attemptId);
        if (attempt === null) return fail("not_found");
        const now = ctx.clock.now();
        convertIfClosed(attempt, now);
        if (attempt.status === "finished" && attempt.summary !== null) {
          return ok(attempt.summary);
        }
        // Voided rounds still ahead resolve here, one after another, so a
        // voided last round finishes the attempt (§8.8).
        while (
          withdrawIfVoided(ctx, db, attempt, now, { onlyIfOpen: false }) !==
          null
        ) {
          // Each pass withdraws the round that became current.
        }
        if (attempt.status === "finished" && attempt.summary !== null) {
          return ok(attempt.summary);
        }
        return fail("invalid_input");
      }, TABLES);
    },
  };
}
