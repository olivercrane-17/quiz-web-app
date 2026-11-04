/**
 * CNT-2's mystery rules (CONTENT_GUIDE §2.13, ARCHITECTURE §5.2):
 *
 * - `optionsFromClue` from src/config/shared.json splits the clues (§2.13):
 *   clues before it are typed against, so they get C12's typing rules;
 *   clues from it on sit beside the four options, so they get C13's
 *   display rule. Changing the value re-lints every sealed item.
 * - C12's **suggestion probe**: the engine's own `suggest()` (ARCHITECTURE
 *   §4.7: word prefixes, and one-edit typos from 5 characters) runs against
 *   the list as it ships (the client projection of §5.5) on every word of a
 *   typed clue and each of its prefixes of 3 or more letters. It fails when
 *   the answer or an accepted id comes back among the rows the box shows
 *   (`SUGGESTION_COUNT`).
 * - C13 on every clue from `optionsFromClue` on: a significant word of the
 *   answer's display form, qualifier included. It supersedes the
 *   pipeline's C13, which read clue 4 by index.
 * - C14's list requests (§2.7, §2.12): a draft may hold a request's `lr.`
 *   id in any entity field until the list builder fills it; from checking
 *   on, any `lr.` id is an error. The pipeline's "not in the list" finding
 *   on an `lr.` id gives way to this one.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Mystery } from "../../../src/content/schema/items.ts";
import { LIST_REQUEST_ID_PATTERN } from "../../../src/content/schema/primitives.ts";
import type { Bank, ListIndex } from "../../../src/content/pipeline/bank.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";
import { foldedWords } from "../../../src/content/pipeline/text.ts";
import {
  createSuggestionIndex,
  normalizeName,
  suggest,
  type SuggestionIndex,
} from "../../../src/engine/suggest/index.ts";
import type { AnswerList } from "../../../src/engine/types/content.ts";
import type { EntityId } from "../../../src/engine/types/ids.ts";
import { projectList } from "../lib/project.ts";

/**
 * The rows the suggestion box shows (`SUGGESTION_COUNT` in
 * src/config/tunables.ts, PRD §4.1.3). A test holds the two equal: the
 * tunables module can't run under plain Node.
 */
export const PROBE_ROWS = 6;

/** The shortest prefix the probe types (§2.13). */
export const PROBE_MIN_LETTERS = 3;

/** `optionsFromClue` at launch, when shared.json can't be read. */
const DEFAULT_OPTIONS_FROM_CLUE = 4;

const sharedCache = new Map<string, number>();

/** `optionsFromClue` from the repository's src/config/shared.json (§5.3). */
export function optionsFromClue(repoRoot: string): number {
  const cached = sharedCache.get(repoRoot);
  if (cached !== undefined) return cached;
  let value = DEFAULT_OPTIONS_FROM_CLUE;
  const path = join(repoRoot, "src", "config", "shared.json");
  if (existsSync(path)) {
    const shared = JSON.parse(readFileSync(path, "utf8")) as {
      optionsFromClue?: unknown;
    };
    if (
      typeof shared.optionsFromClue === "number" &&
      Number.isInteger(shared.optionsFromClue) &&
      shared.optionsFromClue >= 1 &&
      shared.optionsFromClue <= 4
    )
      value = shared.optionsFromClue;
  }
  sharedCache.set(repoRoot, value);
  return value;
}

/** The index of the first clue that sits beside the options (0-based). */
export function firstOptionClue(bank: Bank): number {
  return optionsFromClue(bank.layout.repoRoot) - 1;
}

interface Probe {
  index: SuggestionIndex;
  /** Query to the entity ids the box would show for it. */
  rows: Map<string, readonly string[]>;
}

const probes = new WeakMap<ListIndex, Probe>();

/** The suggestion index of a list as it ships (§5.5), built once per list. */
function probeFor(list: ListIndex): Probe {
  const cached = probes.get(list);
  if (cached) return cached;
  const projected = projectList(
    list.type,
    list.version ?? "",
    list.entities.values(),
  );
  const shipped: AnswerList = {
    type: list.type,
    version: projected.version,
    entities: projected.entities.map(([id, display, keys, popularity]) => ({
      id: id as EntityId,
      display,
      keys,
      popularity,
    })),
  };
  const probe = { index: createSuggestionIndex(shipped), rows: new Map() };
  probes.set(list, probe);
  return probe;
}

function rowsFor(probe: Probe, query: string): readonly string[] {
  const cached = probe.rows.get(query);
  if (cached) return cached;
  const rows = suggest(probe.index, query, { limit: PROBE_ROWS }).rows.map(
    (row) => row.entityId,
  );
  probe.rows.set(query, rows);
  return rows;
}

/** Every word of a clue and each of its prefixes, of 3 or more letters, in order. */
export function probeQueries(clue: string): string[] {
  const out = new Set<string>();
  for (const word of normalizeName(clue).split(" ")) {
    for (let n = PROBE_MIN_LETTERS; n <= word.length; n += 1)
      out.add(word.slice(0, n));
  }
  return [...out];
}

/** C12's suggestion probe on the typed clues of one mystery. */
export function suggestionProbe(bank: Bank, mystery: Mystery): RuleHit[] {
  const list = bank.lists.get(mystery.answerType);
  if (!list) return [];
  const keys = new Set<string>([mystery.answer, ...mystery.accepted]);
  if (![...keys].some((id) => list.entities.has(id))) return [];
  const probe = probeFor(list);
  const hits: RuleHit[] = [];
  const typed = mystery.clues.slice(0, firstOptionClue(bank));
  typed.forEach((clue, index) => {
    const query = probeQueries(clue).find((q) =>
      rowsFor(probe, q).some((id) => keys.has(id)),
    );
    if (query === undefined) return;
    hits.push({
      rule: "C12",
      severity: "error",
      path: `clues[${index}]`,
      message: `typing a word of clue ${index + 1}, or its first letters, brings up the answer in the suggestion box's top ${PROBE_ROWS} (the suggestion probe, §2.13)`,
      excerpt: query,
    });
  });
  return hits;
}

/** Significant words: 4 or more letters and not a stopword (§2.13, C12 and C13). */
function significant(
  words: string[],
  stopwords: ReadonlySet<string>,
): string[] {
  return [
    ...new Set(
      words.filter((word) => word.length >= 4 && !stopwords.has(word)),
    ),
  ];
}

/** C13 on every clue from `optionsFromClue` on. */
export function ruleC13(bank: Bank, mystery: Mystery): RuleHit[] {
  const entity = bank.lists
    .get(mystery.answerType)
    ?.entities.get(mystery.answer);
  if (!entity) return [];
  const words = significant(
    foldedWords(entity.display),
    bank.references.stopwords,
  );
  const hits: RuleHit[] = [];
  for (let index = firstOptionClue(bank); index < 4; index += 1) {
    const found = foldedWords(mystery.clues[index] ?? "").find((word) =>
      words.some((sig) => word === sig || word === `${sig}s`),
    );
    if (found === undefined) continue;
    hits.push({
      rule: "C13",
      severity: "error",
      path: `clues[${index}]`,
      message: `clue ${index + 1} sits beside the four options and contains a word of the answer's display form, which the options show (§5.2 rule 7)`,
      excerpt: found,
    });
  }
  return hits;
}

/** Every entity field of a mystery, with its path. */
function entityFields(mystery: Mystery): [string, string][] {
  return [
    ["answer", mystery.answer],
    ...mystery.accepted.map((id, i): [string, string] => [
      `accepted[${i}]`,
      id,
    ]),
    ...mystery.distractors.map((id, i): [string, string] => [
      `distractors[${i}]`,
      id,
    ]),
    ...mystery.rivals.map((rival, i): [string, string] => [
      `rivals[${i}].id`,
      rival.id,
    ]),
    ...mystery.likelyGuesses.map((id, i): [string, string] => [
      `likelyGuesses[${i}]`,
      id,
    ]),
  ];
}

export const isListRequestId = (id: string) => LIST_REQUEST_ID_PATTERN.test(id);

/** C14: no list request's id from checking on (§2.12). */
export function listRequestIds(mystery: Mystery): RuleHit[] {
  if (mystery.status === "draft") return [];
  return entityFields(mystery)
    .filter(([, id]) => isListRequestId(id))
    .map(([path, id]) => ({
      rule: "C14",
      severity: "error",
      path,
      message:
        "a list request's lr. id stays in a draft only: the list builder fills the request and the draft takes the entity's id before it is submitted (§2.12)",
      excerpt: id,
    }));
}

/** All of CNT-2's mystery rules above for one mystery. */
export function mysteryHits(bank: Bank, mystery: Mystery): RuleHit[] {
  return [
    ...suggestionProbe(bank, mystery),
    ...ruleC13(bank, mystery),
    ...listRequestIds(mystery),
  ];
}

/**
 * The pipeline findings these rules replace: its C13 (clue 4 by index),
 * its C12 typing findings on a clue from `optionsFromClue` on (the length
 * limit stays, for every clue), and its C14 "not in the list" on an `lr.`
 * id, which listRequestIds reports instead.
 */
export function supersededMysteryFinding(
  bank: Bank,
  finding: { rule: string; path?: string; message: string; excerpt?: string },
): boolean {
  if (finding.rule === "C13") return true;
  if (finding.rule === "C12") {
    const clue = /^clues\[(\d)\]$/.exec(finding.path ?? "");
    if (!clue) return false;
    if (/characters; the limit is 140/.test(finding.message)) return false;
    return Number(clue[1]) >= firstOptionClue(bank);
  }
  if (finding.rule === "C14")
    return (
      finding.excerpt !== undefined &&
      isListRequestId(finding.excerpt) &&
      !finding.message.startsWith("a list request's lr. id")
    );
  return false;
}
