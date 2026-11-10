/**
 * The cross-file rules of ARCHITECTURE §5.2 that the pipeline's lint
 * (src/content/pipeline/lint/, CNT-2's) doesn't already run: every row of
 * the table is covered by one or the other, and nothing here repeats a
 * finding the lint makes. content:check runs both.
 *
 * - Items: ascending options must yield one sortKey form (the engine's
 *   own sortKeys, §4.12); quantity encores of 21 or more; band decimals.
 * - Mysteries: the list holds 100 active entities whatever the slot.
 * - Lists: `liveAt` and `addedIn` against git history (X15), the display
 *   rules and overrides of CONTENT_GUIDE §2.10 (X16), the minimums (X17).
 * - Pool: the per-category minimum, the true/false share and the band
 *   shares (X19), and the cross-pool dedupe (X29).
 * - Schedule (CONTENT_GUIDE §10.1 to §10.5, §10.7): coverage from the
 *   epoch (X20), assembly windows (X21), spread within a Daily (X22) and
 *   a week (X23), recent answers as distractors (X24), share layouts
 *   (X25), the runway (X26), reviewBy (X27), pass D before a Daily
 *   freezes or a spare is listed (X28), spare orders (X30), and every
 *   single-Daily rule for spare sets, which the lint leaves out.
 *
 * Launch-only criteria (the counts of AC-CNT-02 to 04, which pass on the
 * real bank at QA-2) are errors with `launch` and silent otherwise, except
 * the per-category minimum, which warns before launch (§5.2). The
 * cross-pool check (X29, AC-CNT-06) is an error whenever sealed items are
 * loaded.
 *
 * Messages name ids, rule codes, fields and counts only; a redacting run
 * prints none of them anyway (report.ts).
 */
import type {
  Bank,
  BankItem,
  ListIndex,
} from "../../../src/content/pipeline/bank.ts";
import {
  DEDUPE_FLAG,
  contentTokens,
  nearestTo,
} from "../../../src/content/pipeline/dedupe.ts";
import { playerTextFields } from "../../../src/content/pipeline/lint/fields.ts";
import { bankDedupeIndex } from "../../../src/content/pipeline/lint/index.ts";
import type { AnswerEntity } from "../../../src/content/schema/answer-lists.ts";
import type {
  AnyItem,
  Encore,
  McItem,
  Mystery,
  RoomQuestion,
} from "../../../src/content/schema/items.ts";
import type { AnswerType } from "../../../src/content/schema/primitives.ts";
import type { RoundRecord } from "../../../src/content/schema/schedule.ts";
import type { DailyCheckRecord } from "../../../src/content/schema/verification.ts";
import { compositionIdOf } from "../../../src/engine/composition.ts";
import { difficultyBandOf } from "../../../src/engine/practice/bands.ts";
import { expectedPoints } from "../../../src/engine/scoring/expected.ts";
import {
  fitsShareCode,
  parseShareLayouts,
} from "../../../src/engine/share/code.ts";
import { normalizeName } from "../../../src/engine/suggest/normalize.ts";
import { sortKeys } from "../../../src/engine/text/metrics.ts";
import type { RoundType } from "../../../src/engine/types/rounds.ts";
import type { Finding } from "../lint.ts";
import { acceptedBeforeRules } from "../lint/cutoff.ts";
import type { ListHistory } from "./git.ts";
import { isShippedEntity } from "./project.ts";

export interface RuleOptions {
  /** ISO date: the runway counts from it. */
  today: string;
  /** QA-2's launch check: the AC-CNT criteria become errors. */
  launch: boolean;
  /** src/config/shared.json dailyEpoch. */
  epoch: string;
  /** content/compositions.json, parsed. */
  compositions: unknown;
  /** Git history per list file (repository-relative path), content banks only. */
  histories: ReadonlyMap<string, ListHistory> | null;
  /** Run the cross-pool dedupe, X29 (default true; `--skip-dedupe` turns it off). */
  dedupe?: boolean;
  /**
   * Treat a fixture tree's mysteries and encores as Daily items, so the
   * cross-pool check (X29) runs on it too (`content:dedupe -- --fixtures`,
   * RITE round 2's R2-22). Every mock build, the playtests' included, plays
   * the fixture practice packs beside the fixture Dailies, and a practice
   * explanation handed a persona the next day's Encore. Off by default, so
   * content:check's fixture run reads as it always has.
   */
  fixtureDailies?: boolean;
  /**
   * The schedule track the schedule rules read (default main). The e2e
   * track's cycle fills undated days from its spares, so X20 (no gaps from
   * the epoch), X26 (the runway) and AC-CNT-02's counts are main-track rules.
   */
  track?: Track;
}

export type Track = "main" | "e2e";

type Severity = Finding["severity"];

const inPlay = (item: AnyItem) =>
  item.status !== "cut" && item.status !== "retired";

function itemFinding(
  record: BankItem,
  rule: string,
  severity: Severity,
  path: string,
  message: string,
): Finding {
  const finding: Finding = {
    rule,
    severity,
    file: record.file.rel,
    itemId: record.id,
    message,
    sealed: record.file.sealed,
  };
  const full =
    record.index === undefined
      ? path
      : `questions[${record.index}]${path ? `.${path}` : ""}`;
  if (full) finding.path = full;
  return finding;
}

function fileFinding(
  rule: string,
  severity: Severity,
  file: string,
  message: string,
  sealed: boolean,
  path?: string,
): Finding {
  const finding: Finding = { rule, severity, file, message, sealed };
  if (path) finding.path = path;
  return finding;
}

/**
 * Rules the lint never ran before CNT-1 must not turn an accepted bank
 * red overnight: an item the editor accepted before they landed warns, so
 * the editor reworks it, while anything accepted since, or not yet active,
 * fails, and under --launch everything fails (the bank must meet them by
 * QA-2). See scripts/content/lint/cutoff.ts.
 */
function deltaSeverity(item: AnyItem, launch: boolean): Severity {
  return launch || !acceptedBeforeRules(item) ? "error" : "warn";
}

const optionPath = (index: number) =>
  index === 0 ? "answer" : `wrong[${index - 1}]`;

// ---------------------------------------------------------------------------
// Items, encores and mysteries
// ---------------------------------------------------------------------------

const LEADS_WITH_DIGIT = /^\s*[-−]?\d/u;

/** C18: ascending options sort by the engine's own key, all of one form (§4.12). */
function ascendingOrder(record: BankItem, launch: boolean): Finding[] {
  const item = record.item as McItem | RoomQuestion;
  if (item.order !== "ascending") return [];
  const options = [item.answer, ...item.wrong];
  const result = sortKeys(options);
  if (result.ok) return [];
  const option = options[result.index] ?? "";
  // An option that doesn't start with a number is the lint's own C18.
  if (result.error === "not_numeric" && !LEADS_WITH_DIGIT.test(option))
    return [];
  const why =
    result.error === "mixed_forms"
      ? "the options mix eras, plain numbers and quantities"
      : result.error === "mixed_units"
        ? "the options carry different units"
        : "this option yields no sort key";
  return [
    itemFinding(
      record,
      "C18",
      deltaSeverity(record.item, launch),
      optionPath(result.index),
      `${why}, so they cannot sort ascending and the engine shuffles them instead (ARCHITECTURE §4.12, §5.2)`,
    ),
  ];
}

function decimalsOver(value: number, places: number): boolean {
  const scaled = value * 10 ** places;
  return Math.abs(scaled - Math.round(scaled)) > 1e-9 * Math.max(1, scaled);
}

/** C15: the parts of ARCHITECTURE §5.2's encore row the lint leaves out. */
function encoreRules(record: BankItem, launch: boolean): Finding[] {
  const encore = record.item as Encore;
  const severity = deltaSeverity(encore, launch);
  const out: Finding[] = [];
  if (
    encore.valueKind === "quantity" &&
    encore.bands === null &&
    encore.answer >= 20 &&
    encore.answer < 21
  ) {
    out.push(
      itemFinding(
        record,
        "C15",
        severity,
        "answer",
        "a quantity answer is 21 or more unless bands are overridden: at 20 the 5% bullseye holds no whole number below the answer (§6 rule 5)",
      ),
    );
  }
  if (encore.bands) {
    for (const key of ["bullseye", "close"] as const) {
      if (decimalsOver(encore.bands[key], 4)) {
        out.push(
          itemFinding(
            record,
            "C15",
            severity,
            `bands.${key}`,
            "custom bands have at most 4 decimal places (ARCHITECTURE §4.6, §5.2)",
          ),
        );
      }
    }
  }
  return out;
}

const activeCount = (list: ListIndex) =>
  [...list.entities.values()].filter(isShippedEntity).length;

/** C14: 100 active entities serve any slot (PRD §3.18.4); the lint asks 30 for slot 1. */
function mysteryListSize(
  bank: Bank,
  record: BankItem,
  launch: boolean,
): Finding[] {
  const mystery = record.item as Mystery;
  if (mystery.slot !== 1) return [];
  const list = bank.lists.get(mystery.answerType);
  if (!list) return [];
  const count = activeCount(list);
  if (count >= 100 || count < 30) return [];
  return [
    itemFinding(
      record,
      "C14",
      deltaSeverity(mystery, launch),
      "answerType",
      `the ${mystery.answerType} list holds ${count} active entities; a Mystery in any slot needs 100, so suggestions never give the answer away (ARCHITECTURE §5.2, PRD §3.18.4)`,
    ),
  ];
}

export function itemRules(bank: Bank, launch = false): Finding[] {
  const out: Finding[] = [];
  for (const record of bank.items) {
    const item = record.item;
    if (!inPlay(item)) continue;
    const kind = "kind" in item ? item.kind : "practice";
    if (
      (kind === "practice" && (item as McItem).format === "mc") ||
      kind === "choice"
    )
      out.push(...ascendingOrder(record, launch));
    if (kind === "encore") out.push(...encoreRules(record, launch));
    if (kind === "mystery" && bank.layout.kind === "content")
      out.push(...mysteryListSize(bank, record, launch));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Answer lists
// ---------------------------------------------------------------------------

/** PRD §3.18.4 minimums. */
export const LIST_MINIMUMS: Readonly<Record<AnswerType, number>> = {
  country: 190,
  city: 300,
  person: 1000,
  film: 500,
  tv_series: 200,
  book: 300,
  animal: 300,
  element: 118,
  landmark: 200,
  music_artist: 500,
  dish: 200,
  sport: 100,
};

/** CONTENT_GUIDE §2.10's six CLDR display overrides, by iso_a2. */
export const COUNTRY_DISPLAY_OVERRIDES: Readonly<Record<string, string>> = {
  MM: "Myanmar",
  CD: "Democratic Republic of the Congo",
  CG: "Republic of the Congo",
  HK: "Hong Kong",
  MO: "Macao",
  PS: "Palestine",
};

/** Cocos (Keeling) Islands keeps its official name (§2.10). */
const BRACKET_ALLOWED_ISO = new Set(["CC"]);
const DESCRIBED: ReadonlySet<AnswerType> = new Set([
  "person",
  "tv_series",
  "music_artist",
]);
const QUALIFIER_SHOWN: ReadonlySet<AnswerType> = new Set([
  "film",
  "book",
  "city",
  "landmark",
]);

/** X16: the display rule of each type (CONTENT_GUIDE §2.10, the display column). */
function displayRules(bank: Bank, list: ListIndex): Finding[] {
  const out: Finding[] = [];
  const entities = [...list.entities.values()];
  const names = new Map<string, number>();
  for (const entity of entities) {
    const key = normalizeName(entity.name);
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  const countries = bank.lists.get("country");
  const countryDisplay = (iso: unknown) =>
    typeof iso === "string"
      ? ([...(countries?.entities.values() ?? [])].find(
          (country) => country.qualifier.iso_a2 === iso,
        )?.display ?? null)
      : null;
  const add = (index: number, message: string) =>
    out.push(
      fileFinding(
        "X16",
        "error",
        list.file.rel,
        `${entities[index]?.id ?? ""}: ${message}`,
        false,
        `entities[${index}].display`,
      ),
    );
  entities.forEach((entity: AnswerEntity, index) => {
    const display = entity.display;
    const bracket = /[()]/.test(display);
    const spacedHyphen = / [-‐‑–—] /.test(display);
    const q = entity.qualifier;
    switch (list.type) {
      case "film":
        if (display !== `${entity.name} (${String(q.year)})`)
          add(index, 'a film shows "Title (Year)", the year of first release');
        return;
      case "book":
        if (display !== `${entity.name} (${String(q.author)})`)
          add(index, 'a book shows "Title (Author)"');
        return;
      case "city": {
        const country = countryDisplay(q.country);
        if (country !== null && display !== `${entity.name}, ${country}`)
          add(
            index,
            'a city shows "Name, Country" with the country\'s display',
          );
        return;
      }
      case "landmark":
        if (!display.startsWith(`${entity.name}, `))
          add(index, 'a landmark shows "Name, Country"');
        return;
      default:
        break;
    }
    if (DESCRIBED.has(list.type)) {
      if (bracket && (names.get(normalizeName(entity.name)) ?? 0) < 2)
        add(
          index,
          "a descriptor shows only when two entries share a name (§2.10 rule 6)",
        );
      if (spacedHyphen)
        add(index, "no display form carries a spaced hyphen (§2.10)");
      return;
    }
    if (
      !QUALIFIER_SHOWN.has(list.type) &&
      (spacedHyphen ||
        (bracket && !BRACKET_ALLOWED_ISO.has(String(q.iso_a2 ?? ""))))
    ) {
      add(
        index,
        "no display form carries a bracket, a spaced hyphen or a qualifier, because a lone bracket among the clue-4 options points at the key (§2.10)",
      );
    }
    if (list.type === "country" && bank.layout.kind === "content") {
      const override = COUNTRY_DISPLAY_OVERRIDES[String(q.iso_a2 ?? "")];
      if (override !== undefined && display !== override)
        add(index, `shows "${override}", CONTENT_GUIDE §2.10's override`);
    }
  });
  return out;
}

/**
 * X15: `liveAt` is the UTC date of the commit that first published the
 * version, and every entry the version added carries `addedIn` equal to it
 * (§2.10 rule 5).
 */
function publishRules(
  list: ListIndex,
  history: ListHistory | undefined,
  today: string,
  notes: string[],
): Finding[] {
  if (history === undefined) return [];
  if (!history.ok) {
    notes.push(
      `Answer lists' liveAt not checked against git history: ${history.reason}.`,
    );
    return [];
  }
  const out: Finding[] = [];
  const raw = list.file.data as { liveAt?: unknown } | undefined;
  const liveAt = typeof raw?.liveAt === "string" ? raw.liveAt : null;
  const version = list.version ?? "";
  const index = history.versions.findIndex((v) => v.version === version);
  const published = index >= 0 ? history.versions[index] : undefined;
  const previous =
    index > 0
      ? history.versions[index - 1]
      : index < 0
        ? history.versions.at(-1)
        : undefined;
  const previousIds = previous?.ids ?? new Set<string>();
  const expected = published?.date ?? liveAt ?? today;
  const severity: Severity = published ? "error" : "warn";
  if (liveAt !== null && liveAt !== expected) {
    out.push(
      fileFinding(
        "X15",
        severity,
        list.file.rel,
        published
          ? `liveAt must be ${published.date}, the UTC date of commit ${published.commit.slice(0, 12)}, which first published version ${version} (§2.10 rule 5)`
          : `version ${version} is not committed yet: liveAt must be the UTC date of the commit that publishes it (§2.10 rule 5)`,
        false,
        "liveAt",
      ),
    );
  }
  const entities = [...list.entities.values()];
  const reported = new Set<number>();
  entities.forEach((entity, i) => {
    const added = published
      ? published.ids.has(entity.id) && !previousIds.has(entity.id)
      : !previousIds.has(entity.id);
    if (!added || entity.addedIn === expected) return;
    reported.add(i);
    out.push(
      fileFinding(
        "X15",
        severity,
        list.file.rel,
        `${entity.id}: an entry version ${version} added carries addedIn ${expected}, the version's liveAt (§2.10 rule 5)`,
        false,
        `entities[${i}].addedIn`,
      ),
    );
  });
  // Every entry already published, whichever version this is: its addedIn
  // is the liveAt of the first published version that held it. A backdated
  // addedIn would shorten the 30-day freeze C14 reads from it.
  const firstHeld = new Map<string, string>();
  for (const held of history.versions)
    for (const id of held.ids)
      if (!firstHeld.has(id)) firstHeld.set(id, held.date);
  entities.forEach((entity, i) => {
    const first = firstHeld.get(entity.id);
    if (first === undefined || reported.has(i) || entity.addedIn === first)
      return;
    out.push(
      fileFinding(
        "X15",
        "error",
        list.file.rel,
        `${entity.id}: addedIn must be ${first}, the liveAt of the first published version that held the entry (§2.10 rule 5)`,
        false,
        `entities[${i}].addedIn`,
      ),
    );
  });
  if (published) {
    const now = new Set(entities.map((entity) => entity.id));
    const changed =
      now.size !== published.ids.size ||
      [...now].some((id) => !published.ids.has(id));
    if (changed) {
      out.push(
        fileFinding(
          "X15",
          "error",
          list.file.rel,
          `the list adds or drops entries but keeps version ${version}, which commit ${published.commit.slice(0, 12)} already published: give the change a new version (§2.10)`,
          false,
          "version",
        ),
      );
    }
  }
  return out;
}

export function listRules(
  bank: Bank,
  options: RuleOptions,
  notes: string[],
): Finding[] {
  const out: Finding[] = [];
  let reported = false;
  for (const list of bank.lists.values()) {
    out.push(...displayRules(bank, list));
    if (bank.layout.kind !== "content") continue;
    const history = options.histories?.get(list.file.rel);
    const before = notes.length;
    out.push(...publishRules(list, history, options.today, notes));
    // One note for the whole bank when history is unavailable.
    if (notes.length > before) {
      if (reported) notes.splice(before);
      reported = true;
    }
    if (options.launch) {
      const count = activeCount(list);
      const minimum = LIST_MINIMUMS[list.type];
      if (count < minimum) {
        out.push(
          fileFinding(
            "X17",
            "error",
            list.file.rel,
            `AC-CNT-03: the ${list.type} list holds ${count} active entries; its launch minimum is ${minimum} (PRD §3.18.4)`,
            false,
          ),
        );
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The practice pool and the cross-pool check
// ---------------------------------------------------------------------------

/** AC-CNT-04's targets: Easy, Medium and Hard each within 5 points of these. */
export const BAND_TARGETS = { easy: 0.4, medium: 0.4, hard: 0.2 } as const;

export function poolRules(bank: Bank, options: RuleOptions): Finding[] {
  if (bank.layout.kind !== "content") return [];
  const out: Finding[] = [];
  const byCategory = new Map<string, AnyItem[]>();
  for (const record of bank.items) {
    if (record.pool !== "practice" || record.item.status !== "active") continue;
    const list = byCategory.get(record.item.category) ?? [];
    list.push(record.item);
    byCategory.set(record.item.category, list);
  }
  // A bank with no active practice yet (a new tree, a test) has nothing
  // to warn about before launch.
  if (byCategory.size === 0 && !options.launch) return [];
  for (const category of bank.categories) {
    const items = byCategory.get(category.id) ?? [];
    const file = `content/practice/${category.slug}`;
    if (items.length < 100) {
      out.push(
        fileFinding(
          "X19",
          options.launch ? "error" : "warn",
          file,
          `AC-CNT-04: ${category.id} has ${items.length} active practice items; launch needs 100 per category (ARCHITECTURE §5.2, PRD §3.18.2)`,
          false,
        ),
      );
    }
    if (!options.launch || items.length === 0) continue;
    const tf = items.filter(
      (item) => !("kind" in item) && item.format === "tf",
    ).length;
    if (tf / items.length > 0.1) {
      out.push(
        fileFinding(
          "X19",
          "error",
          file,
          `AC-CNT-04: ${tf} of ${items.length} active ${category.id} items are true/false; a pack holds at most 10% (PRD §3.18.2)`,
          false,
        ),
      );
    }
    const counts = { easy: 0, medium: 0, hard: 0 };
    for (const item of items) {
      const predicted = "predicted" in item ? item.predicted : undefined;
      if (predicted && "p" in predicted)
        counts[difficultyBandOf(predicted.p)] += 1;
    }
    for (const band of ["easy", "medium", "hard"] as const) {
      const share = counts[band] / items.length;
      if (Math.abs(share - BAND_TARGETS[band]) > 0.05 + 1e-9) {
        out.push(
          fileFinding(
            "X19",
            "error",
            file,
            `AC-CNT-04: ${(share * 100).toFixed(1)}% of active ${category.id} items are ${band} by predicted p; the target is ${BAND_TARGETS[band] * 100}% give or take 5 points (PRD §3.18.2)`,
            false,
          ),
        );
      }
    }
  }
  return out;
}

/**
 * X29 (AC-CNT-06): no practice or room item shares a fact with a Daily
 * item (ARCHITECTURE §5.2's cross-pool level, CONTENT_GUIDE §10.5, §10.9).
 * An error whenever the content bank has its sealed items loaded, from the
 * workspace or decrypted in the content-sealed job (§5.7), launch or not.
 * Reported on the sealed side only, never naming the public one, so no
 * line ties a public item to a sealed answer (§5.4).
 *
 * With `fixtureDailies` a fixture tree's mysteries and encores count as
 * Daily items too (R2-22), and its encores also get the stated-answer
 * check below. A fixture tree holds no sealed content (every file is
 * plaintext in git), so that check names the practice item as well.
 */
export function crossPoolRules(bank: Bank, options: RuleOptions): Finding[] {
  const fixtures = bank.layout.kind === "fixtures";
  if (
    (fixtures && options.fixtureDailies !== true) ||
    bank.sealedSource === "none" ||
    options.dedupe === false
  )
    return [];
  const daily = bank.items.filter(
    (record) =>
      (record.pool === "mystery" || record.pool === "encore") &&
      inPlay(record.item),
  );
  if (daily.length === 0) return [];
  const { index, positions } = bankDedupeIndex(bank, false);
  const poolOf = (id: string) => bank.itemsById.get(id)?.pool;
  const out: Finding[] = [];
  for (const record of daily) {
    const position = positions.get(record.id);
    if (position === undefined) continue;
    const nearest = nearestTo(index, position, (entry) => {
      const pool = poolOf(entry.id);
      return pool === "practice" || pool === "room";
    });
    if (nearest.nearestId === null || nearest.score < DEDUPE_FLAG) continue;
    out.push(
      itemFinding(
        record,
        "X29",
        "error",
        "",
        "AC-CNT-06: a practice or room item shares a fact with this Daily item (CONTENT_GUIDE §10.5); content:dedupe -- --item <id> --reveal names it, in your own terminal",
      ),
    );
  }
  for (const record of bank.items) {
    if (record.pool !== "room" || !inPlay(record.item)) continue;
    const position = positions.get(record.id);
    if (position === undefined) continue;
    const nearest = nearestTo(index, position, (entry) => {
      const pool = poolOf(entry.id);
      return pool === "mystery" || pool === "encore";
    });
    if (nearest.nearestId === null || nearest.score < DEDUPE_FLAG) continue;
    out.push(
      itemFinding(
        record,
        "X29",
        "error",
        "",
        "AC-CNT-06: this room question shares a fact with a Daily item (CONTENT_GUIDE §10.5, §10.9)",
      ),
    );
  }
  if (fixtures) {
    const flagged = new Set(out.map((finding) => finding.itemId));
    out.push(
      ...statedEncoreAnswers(
        bank,
        daily.filter((record) => !flagged.has(record.id)),
      ),
    );
  }
  return out;
}

/**
 * Words that name no subject in an Encore's question: fixture writers mark
 * every invented subject "the fixture ..." (content/fixtures/README.md),
 * and "year" is in every date question.
 */
const NO_SUBJECT = new Set(["fixture", "year"]);

/** Every figure in a text, thousands commas read: "1,388" and "1388" are both 1388. */
function figuresIn(text: string): number[] {
  return [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map(
    (match) => Number(match[0].replace(/,/g, "")),
  );
}

/**
 * X29's stated-answer check (R2-22): a practice or room item whose
 * player-facing text states a Daily Encore's answer beside its subject,
 * the figure itself and at least two of the question's subject words. The
 * near-duplicate score compares a comparison's labels and measure, or a
 * stem and its key, with the Encore's question, so a figure in an
 * explanation or a revealed value slips under it: fx.p.hist.0105's "the
 * Gorlund Games began 184 years later, in 1388" scored 0.48 against the
 * Encore asking for 1388, and a persona scored a bullseye from memory.
 *
 * It runs on fixture trees only. On the content bank it would read sealed
 * Encores in the content-sealed job, where nobody can look at its findings
 * before they fail a run, so it waits for a dry run there.
 */
function statedEncoreAnswers(
  bank: Bank,
  daily: readonly BankItem[],
): Finding[] {
  const { stopwords } = bank.references;
  const sources = bank.items
    .filter(
      (record) =>
        (record.pool === "practice" || record.pool === "room") &&
        inPlay(record.item),
    )
    .map((record) => {
      const text = playerTextFields(record.item)
        .map((field) => field.value)
        .join(" ");
      return {
        id: record.id,
        figures: figuresIn(text),
        words: contentTokens(text, stopwords),
      };
    });
  const out: Finding[] = [];
  for (const record of daily) {
    if (record.pool !== "encore") continue;
    const encore = record.item as Encore;
    const units = contentTokens(
      [encore.unit, encore.unitShort ?? "", encore.unitLabel ?? ""].join(" "),
      stopwords,
    );
    const subject = [...contentTokens(encore.question, stopwords)].filter(
      (word) => !NO_SUBJECT.has(word) && !units.has(word) && !/^\d/.test(word),
    );
    if (subject.length === 0) continue;
    const needed = Math.min(2, subject.length);
    const source = sources.find(
      (candidate) =>
        candidate.figures.some(
          (figure) => Math.abs(figure - encore.answer) < 1e-9,
        ) &&
        subject.filter((word) => candidate.words.has(word)).length >= needed,
    );
    if (source === undefined) continue;
    out.push(
      itemFinding(
        record,
        "X29",
        "error",
        "",
        `AC-CNT-06: ${source.id} states this Encore's answer beside its subject, which gives the Daily away (CONTENT_GUIDE §10.5)`,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// The schedule and the spare sets (CONTENT_GUIDE §10.1 to §10.7)
// ---------------------------------------------------------------------------

/** §10.2 assembly windows on predicted expected points, per slot and per Daily. */
export const SLOT_WINDOWS: Readonly<Record<number, readonly [number, number]>> =
  { 1: [3.2, 3.6], 2: [2.5, 2.9], 3: [1.9, 2.3] };
export const DAILY_WINDOW = [7.8, 8.6] as const;
export const FIRST_WEEK_WINDOW = [8.2, 8.8] as const;
export const RUNWAY_ALARM = 30;
export const FEATURED = new Set(["film", "music", "food"]);

const SLOT_FOR: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

function addDays(date: string, days: number): string {
  const at = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(at).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

/** One Daily of a schedule, or a spare set (`date` null), as the rules read it. */
export interface ScheduleDay {
  /** The schedule file or spare file it came from. */
  file: string;
  /** Null for a spare set. */
  date: string | null;
  label: string;
  rounds: RoundRecord[];
  status: string;
  predictedPoints: number;
  spareOrder: readonly string[] | undefined;
  spareId: string | null;
}

type Day = ScheduleDay;

/** A day with its rounds' items looked up in the bank. */
export interface ResolvedDay {
  day: Day;
  items: { round: RoundRecord; record: BankItem | undefined }[];
  mysteries: Mystery[];
  encores: Encore[];
}
type Resolved = ResolvedDay;

export function resolveDay(bank: Bank, day: Day): Resolved {
  const items = day.rounds.map((round) => ({
    round,
    record: bank.itemsById.get(round.contentId),
  }));
  const kindOf = (r: (typeof items)[number]) =>
    r.record && "kind" in r.record.item ? r.record.item.kind : null;
  return {
    day,
    items,
    mysteries: items
      .filter((r) => kindOf(r) === "mystery")
      .map((r) => r.record?.item as Mystery),
    encores: items
      .filter((r) => kindOf(r) === "encore")
      .map((r) => r.record?.item as Encore),
  };
}

const at = (day: Day) => (day.date === null ? day.label : day.date);

/** X10 to X12 and X14 for a spare set, which the lint checks only on dated Dailies. */
function spareIntegrity(resolved: Resolved): Finding[] {
  const { day } = resolved;
  const out: Finding[] = [];
  const add = (rule: string, message: string) =>
    out.push(
      fileFinding(rule, "error", day.file, `${at(day)}: ${message}`, true),
    );
  for (const { round, record } of resolved.items) {
    if (!record) {
      add("X10", `round ${round.contentId} names no item`);
      continue;
    }
    const item = record.item;
    const kind = "kind" in item ? item.kind : "practice";
    const wanted =
      round.type === "mystery" || round.type === "encore"
        ? round.type
        : "choice";
    if (kind !== wanted)
      add(
        "X10",
        `round ${round.contentId} is a ${kind} item in a ${round.type} round`,
      );
    if (item.status !== "active")
      add("X10", `round ${round.contentId} is ${item.status}, not active`);
    if (item.region !== "global")
      add(
        "X14",
        `round ${round.contentId} is ${item.region}; Dailies are global (§10.3)`,
      );
    if (kind === "mystery") {
      const slot =
        round.difficulty === null ? undefined : SLOT_FOR[round.difficulty];
      if (slot !== (item as Mystery).slot)
        add(
          "X11",
          `round ${round.contentId} is slot ${(item as Mystery).slot} in a ${String(round.difficulty)} round`,
        );
    }
  }
  const { mysteries } = resolved;
  if (mysteries.length >= 2) {
    if (new Set(mysteries.map((m) => m.category)).size !== mysteries.length)
      add("X12", "the mysteries do not come from different categories (§10.3)");
    if (new Set(mysteries.map((m) => m.answerType)).size !== mysteries.length)
      add("X12", "the mysteries do not have different answer types (§10.3)");
  }
  return out;
}

/** X21, X22, X25 and X27: the rules one Daily (or one spare set) obeys on its own. */
export function singleDailyRules(
  resolved: Resolved,
  layouts: ReadonlyMap<string, string> | null,
  dailyNumber: number | null,
): Finding[] {
  const { day, mysteries, encores, items } = resolved;
  const out: Finding[] = [];
  const add = (rule: string, severity: Severity, message: string) =>
    out.push(
      fileFinding(rule, severity, day.file, `${at(day)}: ${message}`, true),
    );
  // X21: assembly windows (§10.2). A frozen Daily is fixed, so it warns.
  const windowSeverity: Severity =
    day.status === "assembled" ? "error" : "warn";
  let total = 0;
  for (const mystery of mysteries) {
    const points = expectedPoints(
      mystery.predicted ?? { solveByClue: [0, 0, 0, 0] },
    );
    total += points;
    const window = SLOT_WINDOWS[mystery.slot];
    if (window && (points < window[0] - 1e-9 || points > window[1] + 1e-9)) {
      add(
        "X21",
        windowSeverity,
        `${mystery.id} predicts ${points.toFixed(2)} points; Mystery ${mystery.slot}'s window is ${window[0]} to ${window[1]} (§10.2)`,
      );
    }
  }
  if (mysteries.length === 3) {
    const window =
      dailyNumber !== null && dailyNumber <= 7
        ? FIRST_WEEK_WINDOW
        : DAILY_WINDOW;
    if (total < window[0] - 1e-9 || total > window[1] + 1e-9) {
      add(
        "X21",
        windowSeverity,
        `the Daily predicts ${total.toFixed(2)} points; the window is ${window[0]} to ${window[1]} (§10.2)`,
      );
    }
    if (Math.abs(total - day.predictedPoints) > 0.005) {
      add(
        "X21",
        "error",
        `predictedPoints ${day.predictedPoints} is not the sum of its mysteries' expected points, ${total.toFixed(2)} (§8.3)`,
      );
    }
  }
  // X22: spread within a Daily (§10.3).
  const mysteryCategories = new Set(mysteries.map((m) => m.category));
  for (const encore of encores) {
    if (mysteryCategories.has(encore.category))
      add(
        "X22",
        "error",
        `the encore ${encore.id} shares a category with a mystery (§10.3)`,
      );
  }
  const all = items.flatMap(({ record }) => (record ? [record.item] : []));
  if (all.length > 0 && !all.some((item) => item.counterintuitive))
    add("X22", "error", "no item is counterintuitive (§10.3)");
  const tagOwners = new Map<string, string>();
  for (const item of all) {
    for (const tag of new Set(item.tags)) {
      const owner = tagOwners.get(tag);
      if (owner !== undefined && owner !== item.id)
        add(
          "X22",
          "error",
          `${owner} and ${item.id} share the tag ${tag} (§10.3)`,
        );
      else tagOwners.set(tag, item.id);
    }
  }
  const answers = new Set(mysteries.map((m) => m.answer));
  for (const mystery of mysteries) {
    for (const id of [...mystery.distractors, ...mystery.accepted]) {
      if (answers.has(id) && id !== mystery.answer)
        add(
          "X22",
          "error",
          `${mystery.id} offers another mystery's answer that day (§10.3)`,
        );
    }
  }
  // X25: a share layout that fits (ARCHITECTURE §4.9).
  const composition = compositionIdOf(
    day.rounds.map((round) => round.type as RoundType),
  );
  if (layouts !== null && !layouts.has(composition))
    add(
      "X25",
      "error",
      `composition ${composition} has no share layout in content/compositions.json (§4.9)`,
    );
  else if (!fitsShareCode(composition))
    add(
      "X25",
      "error",
      `composition ${composition} cannot fit its share code in 8 characters (§4.9)`,
    );
  // X27: nothing scheduled on or after its reviewBy (§9.9 rule 7).
  if (day.date !== null) {
    for (const item of all) {
      if (item.reviewBy !== null && day.date >= item.reviewBy)
        add(
          "X27",
          "error",
          `${item.id} is scheduled on or after its reviewBy (§9.9 rule 7)`,
        );
    }
  }
  return out;
}

function dailyChecksOf(item: AnyItem): readonly DailyCheckRecord[] {
  const verification = "verification" in item ? item.verification : undefined;
  return verification?.dailyChecks ?? [];
}

/**
 * X28: a passing pass D, for the date (or with forDate null for a spare
 * set), against the list versions that ship now (§9.9 rule 7).
 */
export function passD(
  bank: Bank,
  resolved: Resolved,
  forDate: string | null,
  why: string,
): Finding[] {
  const { day } = resolved;
  const out: Finding[] = [];
  for (const { record } of resolved.items) {
    if (!record) continue;
    const item = record.item;
    const listType =
      "kind" in item && item.kind === "mystery" ? item.answerType : null;
    const shipping =
      listType === null ? null : (bank.lists.get(listType)?.version ?? null);
    const ok = dailyChecksOf(item).some(
      (check) =>
        check.verdict === "pass" &&
        check.forDate === forDate &&
        (forDate !== null ||
          check.spareId === undefined ||
          check.spareId === day.spareId) &&
        (listType === null || check.listVersions[listType] === shipping),
    );
    if (!ok) {
      out.push(
        fileFinding(
          "X28",
          "error",
          day.file,
          `${at(day)}: ${record.id} has no passing pass D ${forDate === null ? "for a spare set" : `for ${forDate}`} against the list versions that ship now, so the ${why} (§9.9 rule 7)`,
          true,
        ),
      );
    }
  }
  return out;
}

/** X23: the week rules of §10.4 over consecutive Dailies, mystery slots only for categories. */
export function weekRules(days: readonly Resolved[]): Finding[] {
  const out: Finding[] = [];
  const add = (last: Resolved, message: string) =>
    out.push(
      fileFinding(
        "X23",
        "error",
        last.day.file,
        `${at(last.day)}: ${message}`,
        true,
      ),
    );
  const consecutive = (from: number, length: number) => {
    const slice = days.slice(from, from + length);
    if (slice.length < length) return null;
    for (let i = 1; i < slice.length; i += 1) {
      const a = slice[i - 1]?.day.date;
      const b = slice[i]?.day.date;
      if (a == null || b == null || daysBetween(a, b) !== 1) return null;
    }
    return slice;
  };
  for (let i = 1; i < days.length; i += 1) {
    const window = consecutive(i - 1, 2);
    if (!window) continue;
    const [a, b] = window as [Resolved, Resolved];
    const shared = [...new Set(a.mysteries.map((m) => m.category))].filter(
      (c) => b.mysteries.some((m) => m.category === c),
    );
    for (const category of shared)
      add(
        b,
        `${category} is in the mystery slots on two consecutive days (§10.4)`,
      );
  }
  for (let i = 0; i + 7 <= days.length; i += 1) {
    const week = consecutive(i, 7);
    if (!week) continue;
    const last = week[6] as Resolved;
    const from = week[0]?.day.date ?? "";
    const categories = new Map<string, number>();
    const types = new Map<string, number>();
    const tags = new Map<string, number>();
    let featured = 0;
    let years = 0;
    for (const day of week) {
      for (const m of day.mysteries) {
        categories.set(m.category, (categories.get(m.category) ?? 0) + 1);
        types.set(m.answerType, (types.get(m.answerType) ?? 0) + 1);
      }
      if (day.mysteries.some((m) => FEATURED.has(m.category))) featured += 1;
      years += day.encores.filter((e) => e.valueKind === "year").length;
      for (const { record } of day.items) {
        for (const tag of new Set(record?.item.tags ?? []))
          tags.set(tag, (tags.get(tag) ?? 0) + 1);
      }
    }
    for (const [category, count] of categories) {
      if (count > 2)
        add(
          last,
          `${category} fills ${count} mystery slots in the 7 Dailies from ${from}; at most 2 (§10.4)`,
        );
    }
    if (featured < 4)
      add(
        last,
        `Film & TV, Music or Food & Drink is in the mystery slots of ${featured} of the 7 Dailies from ${from}; at least 4 (§10.4)`,
      );
    for (const [type, count] of types) {
      if (count > 4)
        add(
          last,
          `the answer type ${type} appears ${count} times in the 7 Dailies from ${from}; at most 4 (§10.4)`,
        );
    }
    if (years > 2)
      add(
        last,
        `${years} year encores in the 7 Dailies from ${from}; at most 2 (§10.4)`,
      );
    for (const [tag, count] of tags) {
      if (count > 2)
        add(
          last,
          `the tag ${tag} appears ${count} times in the 7 Dailies from ${from}; at most 2 (§10.4)`,
        );
    }
  }
  for (let i = 0; i + 6 <= days.length; i += 1) {
    const six = consecutive(i, 6);
    if (!six) continue;
    const seen = new Set<string>(
      six.flatMap((day) => day.mysteries.map((m) => m.category)),
    );
    const missing = CATEGORY_ORDER.filter((c) => !seen.has(c));
    if (missing.length > 0)
      add(
        six[5] as Resolved,
        `${missing.join(", ")} not in a mystery slot in the 6 Dailies from ${six[0]?.day.date ?? ""} (§10.4)`,
      );
  }
  return out;
}

const CATEGORY_ORDER = [
  "geo",
  "hist",
  "sci",
  "nat",
  "film",
  "music",
  "art",
  "book",
  "sport",
  "food",
  "lang",
  "soc",
];

/** X24: an entity that was an answer in the last 7 days is no distractor (§10.5). */
export function recentAnswerRules(days: readonly Resolved[]): Finding[] {
  const out: Finding[] = [];
  const answeredOn = new Map<string, string[]>();
  for (const day of days) {
    if (day.day.date === null) continue;
    for (const m of day.mysteries) {
      const list = answeredOn.get(m.answer) ?? [];
      list.push(day.day.date);
      answeredOn.set(m.answer, list);
    }
  }
  for (const day of days) {
    const date = day.day.date;
    if (date === null) continue;
    for (const m of day.mysteries) {
      for (const id of m.distractors) {
        const recent = (answeredOn.get(id) ?? []).some((other) => {
          const gap = daysBetween(other, date);
          return gap >= 1 && gap <= 7;
        });
        if (recent) {
          out.push(
            fileFinding(
              "X24",
              "error",
              day.day.file,
              `${date}: ${m.id} offers a distractor that was an answer in the last 7 days (§10.5)`,
              true,
            ),
          );
        }
      }
    }
  }
  return out;
}

/** What the per-day schedule rules need besides the bank. */
export interface DayRuleOptions {
  /** src/config/shared.json dailyEpoch: Daily numbers, for the first week's window. */
  epoch: string;
  /** content/compositions.json, parsed (X25). */
  compositions: unknown;
}

function shareLayouts(
  compositions: unknown,
): ReadonlyMap<string, string> | null {
  try {
    return parseShareLayouts(compositions).codeOf;
  } catch {
    // The build reports a broken compositions.json (X25) itself.
    return null;
  }
}

/**
 * The schedule rules over an explicit list of dated Dailies, held in
 * memory: X21, X22, X25 and X27 on each Daily, pass D (X28) on a frozen or
 * published one, and the week (X23) and recent-answer (X24) rules across
 * them. The scheduler (CNT-3) checks a candidate day, or a 7-day window,
 * with this before it writes anything; scheduleRules runs it over a track.
 */
export function scheduleDayRules(
  bank: Bank,
  days: readonly ScheduleDay[],
  options: DayRuleOptions,
): Finding[] {
  const layouts = shareLayouts(options.compositions);
  const sorted = [...days].sort((a, b) =>
    (a.date ?? "") < (b.date ?? "") ? -1 : 1,
  );
  const resolvedDays = sorted.map((day) => resolveDay(bank, day));
  const out: Finding[] = [];
  for (const resolved of resolvedDays) {
    const date = resolved.day.date ?? "";
    out.push(
      ...singleDailyRules(
        resolved,
        layouts,
        daysBetween(options.epoch, date) + 1,
      ),
    );
    if (resolved.day.status === "frozen" || resolved.day.status === "published")
      out.push(...passD(bank, resolved, date, "Daily cannot freeze"));
  }
  out.push(...weekRules(resolvedDays), ...recentAnswerRules(resolvedDays));
  return out;
}

/** The schedule's Dailies and spare sets on one track, as the rules read them. */
export function trackDays(
  bank: Bank,
  track: Track,
): { dailies: ScheduleDay[]; spares: ScheduleDay[] } {
  const dailies = bank.schedules
    .filter(({ month }) => month.track === track)
    .flatMap(({ file, month }) =>
      month.dailies.map((daily): Day => ({
        file: file.rel,
        date: daily.date,
        label: daily.date,
        rounds: daily.rounds,
        status: daily.status,
        predictedPoints: daily.predictedPoints,
        spareOrder: daily.spareOrder,
        spareId: null,
      })),
    )
    .sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? -1 : 1));
  const spares = bank.spares
    .filter(({ spare }) => spare.track === track)
    .map(({ file, spare }): Day => ({
      file: file.rel,
      date: null,
      label: spare.id,
      rounds: spare.rounds,
      status: spare.status,
      predictedPoints: spare.predictedPoints,
      spareOrder: undefined,
      spareId: spare.id,
    }))
    .sort((a, b) => (a.label < b.label ? -1 : 1));
  return { dailies, spares };
}

export function scheduleRules(
  bank: Bank,
  options: RuleOptions,
  notes: string[],
): Finding[] {
  const out: Finding[] = [];
  const track: Track = options.track ?? "main";
  const layouts = shareLayouts(options.compositions);
  const { dailies: main, spares } = trackDays(bank, track);
  const resolvedSpares = spares.map((day) => resolveDay(bank, day));

  // X20: one Daily per date with no gaps from the epoch, and X26: the
  // runway (§10.7). Main track only: the e2e cycle fills undated days from
  // its spares (ARCHITECTURE §8.17).
  if (track === "main" && main.length > 0) {
    const first = main[0]?.date ?? options.epoch;
    const last = main.at(-1)?.date ?? options.epoch;
    if (first < options.epoch) {
      out.push(
        fileFinding(
          "X20",
          "error",
          main[0]?.file ?? "",
          `${first}: a Daily before DAILY_EPOCH (${options.epoch})`,
          true,
        ),
      );
    }
    const dates = new Set(main.map((day) => day.date));
    const missing: string[] = [];
    for (let date = options.epoch; date <= last; date = addDays(date, 1)) {
      if (!dates.has(date)) missing.push(date);
    }
    if (missing.length > 0) {
      out.push(
        fileFinding(
          "X20",
          "error",
          main.at(-1)?.file ?? "",
          `${missing.length} date(s) between DAILY_EPOCH and ${last} have no Daily, from ${missing[0] ?? ""} (§10.7)`,
          true,
        ),
      );
    }
    const ahead = main.filter(
      (day) => (day.date ?? "") >= options.today,
    ).length;
    if (ahead < RUNWAY_ALARM) {
      out.push(
        fileFinding(
          "X26",
          "warn",
          main.at(-1)?.file ?? "",
          `${ahead} scheduled Daily(ies) from ${options.today}; the runway alarm sounds below ${RUNWAY_ALARM} (§10.7)`,
          true,
        ),
      );
    }
  }
  if (track === "main" && options.launch && bank.layout.kind === "content") {
    const dates = new Set(main.map((day) => day.date));
    let run = 0;
    for (let date = options.epoch; dates.has(date); date = addDays(date, 1))
      run += 1;
    if (run < 100 || spares.length < 20) {
      out.push(
        fileFinding(
          "X20",
          "error",
          "content/sealed/schedule",
          `AC-CNT-02: ${run} consecutive Dailies from DAILY_EPOCH and ${spares.length} spare sets on the main track; launch needs 100 and 20 (PRD §3.18.2)`,
          true,
        ),
      );
    }
  }

  out.push(...scheduleDayRules(bank, main, options));

  // Spare sets: every single-Daily rule on their own (§10.7).
  const listed = new Set(main.flatMap((day) => day.spareOrder ?? []));
  const spareIds = new Set(spares.map((spare) => spare.label));
  const otherTrack = new Set(
    bank.spares
      .filter(({ spare }) => spare.track !== track)
      .map(({ spare }) => spare.id),
  );
  for (const resolved of resolvedSpares) {
    out.push(
      ...spareIntegrity(resolved),
      ...singleDailyRules(resolved, layouts, null),
    );
    if (listed.has(resolved.day.label) || resolved.day.status === "frozen")
      out.push(...passD(bank, resolved, null, "spare set cannot be listed"));
  }
  // X30: spare orders name spare sets of the same track.
  for (const day of main) {
    if (day.spareOrder === undefined) {
      if (spares.length > 0)
        out.push(
          fileFinding(
            "X30",
            "warn",
            day.file,
            `${day.date ?? ""}: no spareOrder, so a failed publish has no ranked spare (§10.7)`,
            true,
          ),
        );
      continue;
    }
    for (const id of day.spareOrder) {
      if (!spareIds.has(id))
        out.push(
          fileFinding(
            "X30",
            "error",
            day.file,
            `${day.date ?? ""}: spareOrder names ${id}, which is ${otherTrack.has(id) ? "a spare set of another track" : `no ${track}-track spare set`} (§10.7)`,
            true,
          ),
        );
    }
  }
  if (
    track === "main" &&
    main.length === 0 &&
    spares.length === 0 &&
    bank.layout.kind === "content"
  )
    notes.push(
      "No main-track schedule or spare sets loaded: the schedule rules had nothing to check.",
    );
  return out;
}

/** Every CNT-1 rule over one bank. */
export function cnt1Findings(
  bank: Bank,
  options: RuleOptions,
  notes: string[],
): Finding[] {
  return [
    ...itemRules(bank, options.launch),
    ...listRules(bank, options, notes),
    ...poolRules(bank, options),
    ...crossPoolRules(bank, options),
    ...scheduleRules(bank, options, notes),
  ];
}
