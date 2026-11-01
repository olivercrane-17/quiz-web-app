/**
 * Suggestions for the guess combobox (ARCHITECTURE §4.7, PRD §4.1.3). All
 * matching runs on the device against the cached list; nothing is sent per
 * keystroke.
 *
 * 1. **Normalize** the query with `normalizeName`, the function the build
 *    used for every entity's `keys` (the name first, then the aliases).
 * 2. **Match**: the query is a prefix of a key, or of a key from one of its
 *    word starts. From 5 characters, a key or word also matches when it
 *    starts with a string within one edit of the query. Two more keys sit
 *    at the canonical-name tier:
 *    - the normalized display, when it adds a qualifier to the name ("Ada
 *      Morrow (sculptor)" is "ada morrow sculptor", "Paris, France" is
 *      "paris france"), so typing the qualifier, or editing a display the
 *      field was filled with, keeps the row. This reads PRD §4.1.3 step 2's
 *      "canonical name" as the name plus its qualifier, for the PM to
 *      confirm;
 *    - the display with its leading article kept ("the copper owls"),
 *      matched by the query normalized the same way, so every prefix of
 *      "The Copper Owls" ("t", "th", "the", "the c") lists it while the
 *      article is still being typed (`article.ts`).
 * 3. **Rank** by tier (exact key, canonical-name prefix, alias prefix, word
 *    prefix, typo), then `popularity` descending, then alphabetically.
 *    Popularity is global, so the order never hints at today's answer.
 * 4. **Return** up to `limit` rows (`SUGGESTION_COUNT`, 6), each entity once
 *    at its best tier, already-guessed ones flagged rather than dropped.
 * 5. **Exact Enter**: `exactMatch` is the single entity whose name, alias or
 *    display equals the normalized text, if exactly one does.
 *
 * The index is built once per list. A keystroke scans every key with
 * `startsWith` at precomputed word starts, and the typo pass is linear per
 * position, so the largest list (people, about 3,000 entities) stays far
 * under the 4 ms budget a benchmark guards.
 */
import type { AnswerEntity, AnswerList } from "../types/content.ts";
import type { EntityId } from "../types/ids.ts";
import { normalizeKeepingArticle, startsWithArticle } from "./article.ts";
import { normalizeName } from "./normalize.ts";
import { highlightRange } from "./offsets.ts";
import { TYPO_MIN_LENGTH, prefixWithinOneEdit } from "./typo.ts";

export { normalizeKeepingArticle } from "./article.ts";
export { normalizeName } from "./normalize.ts";
export { highlightRange, normalizeWithOffsets } from "./offsets.ts";
export { TYPO_MIN_LENGTH, prefixWithinOneEdit } from "./typo.ts";

export const MATCH_TIERS = [
  "exact",
  "name_prefix",
  "alias_prefix",
  "word_prefix",
  "typo",
] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];

interface Entry {
  entity: AnswerEntity;
  /** keys[0] is the canonical name, the rest the aliases. */
  keys: readonly string[];
  /** Per key, the offsets where a word after the first begins. */
  wordStarts: readonly (readonly number[])[];
  /** Tie order: the normalized display. */
  sortName: string;
  /** The normalized display when it isn't one of `keys`: the name plus its qualifier. */
  displayKey: string | null;
  /** The display with its leading article kept, when it starts with one. */
  articleKey: string | null;
}

export interface SuggestionIndex {
  readonly size: number;
  /** @internal */
  readonly entries: readonly Entry[];
  /**
   * @internal Normalized key (name, alias or display) to the entries holding
   * it; namesakes share a name key.
   */
  readonly exact: ReadonlyMap<string, readonly number[]>;
}

export interface SuggestMatch {
  entityId: EntityId;
  display: string;
  alreadyGuessed: boolean;
  tier: MatchTier;
  /** The matched part of `display` for `<mark>`; null when an alias or a typo matched. */
  match: { start: number; end: number } | null;
}

export interface SuggestResult {
  rows: SuggestMatch[];
  /** Every matching entity, of which `rows` are the first. */
  total: number;
}

function wordStartsOf(key: string): number[] {
  const starts: number[] = [];
  for (let i = 1; i < key.length; i += 1) {
    if (key.charAt(i - 1) === " " && key.charAt(i) !== " ") starts.push(i);
  }
  return starts;
}

const indexes = new WeakMap<AnswerList, SuggestionIndex>();

/** Prepares a list once; the same list object always gives the same index. */
export function createSuggestionIndex(list: AnswerList): SuggestionIndex {
  const cached = indexes.get(list);
  if (cached !== undefined) return cached;
  const entries: Entry[] = [];
  const exact = new Map<string, number[]>();
  for (const entity of list.entities) {
    const keys = entity.keys.filter((key) => key !== "");
    if (keys.length === 0) continue;
    const at = entries.length;
    const sortName = normalizeName(entity.display);
    const displayKey =
      sortName !== "" && !keys.includes(sortName) ? sortName : null;
    const kept = normalizeKeepingArticle(entity.display);
    entries.push({
      entity,
      keys,
      wordStarts: keys.map(wordStartsOf),
      sortName,
      displayKey,
      articleKey: startsWithArticle(kept) ? kept : null,
    });
    // The article-kept key stays out: an exact query drops its article, so
    // it already meets the name or the display.
    const exactKeys = displayKey === null ? keys : [...keys, displayKey];
    for (const key of new Set(exactKeys)) {
      const holders = exact.get(key);
      if (holders === undefined) exact.set(key, [at]);
      else holders.push(at);
    }
  }
  const index: SuggestionIndex = { size: entries.length, entries, exact };
  indexes.set(list, index);
  return index;
}

const TIER_RANK: Readonly<Record<MatchTier, number>> = {
  exact: 0,
  name_prefix: 1,
  alias_prefix: 2,
  word_prefix: 3,
  typo: 4,
};

/** What the row can highlight: the name or display as normalized, the display with its article, or nothing. */
type Highlight = "name" | "article" | null;

interface Hit {
  entry: Entry;
  tier: MatchTier;
  highlight: Highlight;
}

/** True when `found` would beat the best tier so far. */
const beats = (found: MatchTier, tier: MatchTier | null) =>
  tier === null || TIER_RANK[found] < TIER_RANK[tier];

// Plain loops rather than `some` with a closure: these run for every key on
// every keystroke.
function startsAtAWord(
  key: string,
  starts: readonly number[],
  query: string,
): boolean {
  for (let s = 0; s < starts.length; s += 1) {
    if (key.startsWith(query, starts[s])) return true;
  }
  return false;
}

function typoAtAWord(
  key: string,
  starts: readonly number[],
  query: string,
): boolean {
  for (let s = 0; s < starts.length; s += 1) {
    if (prefixWithinOneEdit(key, starts[s] as number, query)) return true;
  }
  return false;
}

/**
 * The entry's best tier for the query (`articleQuery` is the same text with
 * its leading article kept), or null when nothing matches.
 */
function bestHit(
  entry: Entry,
  query: string,
  articleQuery: string,
  typos: boolean,
): Hit | null {
  const { keys, wordStarts, displayKey, articleKey } = entry;
  let tier: MatchTier | null = null;
  let highlight: Highlight = null;
  for (let k = 0; k < keys.length; k += 1) {
    const key = keys[k] as string;
    let found: MatchTier | null = null;
    if (key === query) found = "exact";
    else if (key.startsWith(query)) {
      found = k === 0 ? "name_prefix" : "alias_prefix";
    } else if (startsAtAWord(key, wordStarts[k] as readonly number[], query)) {
      found = "word_prefix";
    }
    if (found !== null && beats(found, tier)) {
      tier = found;
      highlight = k === 0 ? "name" : null;
      if (found === "exact") break;
    }
  }
  // The display, which adds the qualifier to the name, ranks as the name.
  if (displayKey !== null && tier !== "exact") {
    if (displayKey === query) {
      tier = "exact";
      highlight = "name";
    } else if (beats("name_prefix", tier) && displayKey.startsWith(query)) {
      tier = "name_prefix";
      highlight = "name";
    }
  }
  // An article still being typed: "the" reaches "The Copper Owls". Once
  // the player has typed the article, it is bolded with the rest.
  if (articleKey !== null && articleKey.startsWith(articleQuery)) {
    if (beats("name_prefix", tier)) {
      tier = "name_prefix";
      highlight = "article";
    } else if (highlight === "name" && articleQuery !== query) {
      highlight = "article";
    }
  }
  if (tier !== null) return { entry, tier, highlight };
  if (!typos) return null;
  // Typos only for an entity nothing better matched, the last tier. The
  // display key takes no typos: "ada morrow s" would read as a slip for
  // "ada morrow c" and list the namesake the player is typing past.
  for (let k = 0; k < keys.length; k += 1) {
    const key = keys[k] as string;
    if (
      prefixWithinOneEdit(key, 0, query) ||
      typoAtAWord(key, wordStarts[k] as readonly number[], query)
    ) {
      return { entry, tier: "typo", highlight: null };
    }
  }
  return null;
}

function compareHits(a: Hit, b: Hit): number {
  return (
    TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
    b.entry.entity.popularity - a.entry.entity.popularity ||
    (a.entry.sortName < b.entry.sortName
      ? -1
      : a.entry.sortName > b.entry.sortName
        ? 1
        : 0) ||
    (a.entry.entity.display < b.entry.entity.display
      ? -1
      : a.entry.entity.display > b.entry.entity.display
        ? 1
        : 0) ||
    (a.entry.entity.id < b.entry.entity.id ? -1 : 1)
  );
}

export interface SuggestOptions {
  /** At most this many rows (`SUGGESTION_COUNT`). */
  limit: number;
  /** Entities guessed already in this Mystery: listed, flagged. */
  alreadyGuessed?: ReadonlySet<EntityId>;
}

/** The ranked rows for what the player has typed. */
export function suggest(
  index: SuggestionIndex,
  rawQuery: string,
  options: SuggestOptions,
): SuggestResult {
  const query = normalizeName(rawQuery);
  if (query === "" || options.limit <= 0) return { rows: [], total: 0 };
  const articleQuery = normalizeKeepingArticle(rawQuery);
  const typos = query.length >= TYPO_MIN_LENGTH;
  // Keep only the best `limit` hits, in order, while counting every match.
  const top: Hit[] = [];
  let total = 0;
  for (const entry of index.entries) {
    const hit = bestHit(entry, query, articleQuery, typos);
    if (hit === null) continue;
    total += 1;
    if (top.length === options.limit) {
      const last = top[top.length - 1] as Hit;
      if (compareHits(hit, last) >= 0) continue;
      top.pop();
    }
    let at = top.length;
    while (at > 0 && compareHits(hit, top[at - 1] as Hit) < 0) at -= 1;
    top.splice(at, 0, hit);
  }
  const guessed = options.alreadyGuessed;
  return {
    total,
    rows: top.map(({ entry, tier, highlight }) => ({
      entityId: entry.entity.id,
      display: entry.entity.display,
      alreadyGuessed: guessed?.has(entry.entity.id) ?? false,
      tier,
      match:
        highlight === null || tier === "typo"
          ? null
          : highlight === "article"
            ? highlightRange(entry.entity.display, articleQuery, {
                keepArticle: true,
              })
            : highlightRange(entry.entity.display, query),
    })),
  };
}

/**
 * The single entity whose name, alias or display equals the normalized text
 * (PRD §4.1.3 step 6), or null for none or for namesakes sharing the name.
 */
export function exactMatch(
  index: SuggestionIndex,
  rawQuery: string,
): AnswerEntity | null {
  const query = normalizeName(rawQuery);
  if (query === "") return null;
  const holders = index.exact.get(query);
  if (holders?.length !== 1) return null;
  return index.entries[holders[0] as number]?.entity ?? null;
}
