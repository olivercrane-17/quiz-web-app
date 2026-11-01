/**
 * Near-duplicate detection across the whole bank and the guide's worked
 * examples (lint C22, verification.dedupe).
 *
 * Each item becomes a set of content words (folded, stopwords out, plurals
 * trimmed) from the text that carries its fact, plus answer keys. Two items
 * score:
 *
 *   text  = max(Jaccard, 0.8 × containment)  (containment once both have 3+ words)
 *   score = text, or max(text, 0.5 + 0.5 × text) when they share an answer
 *
 * and two mysteries with the same answer entity score at least 0.9, because
 * no mystery answer repeats anywhere in the bank (§11.4). Scores of 0.5 and
 * up are flagged; the editor decides (`related_ok` or `duplicate`).
 *
 * Pairs that cross the seal. A plaintext item (or a guide example, whose
 * answer the public guide prints) next to a sealed item gives the sealed
 * answer away by inference, and the content-sealed job's logs are public
 * (ARCHITECTURE §5.4). So reports name such a pair only on the sealed side,
 * as "a public item" with no id, score or reason, and look for a plaintext
 * item's nearest neighbour among public entries only. `--reveal` shows the
 * pair. Stored records follow: a plaintext item whose nearest is sealed
 * records `nearestId: "sealed"` and `score: null`. So does one whose nearest
 * is a guide example of a sealed kind (a mystery, encore or room question,
 * such as `m.geo.0001`): its id has the shape of a sealed id, and nothing
 * reading a public file (the secret scan included) can tell the two apart.
 */
import type { AnswerEntity } from "../schema/answer-lists.ts";
import { SEALED_NEAREST } from "../schema/verification.ts";
import { parseItemId } from "./ids.ts";
import { foldName, foldedWords } from "./text.ts";

export const DEDUPE_FLAG = 0.5;
export const DEDUPE_LIKELY_DUPLICATE = 0.85;

/** Words that carry no fact in a question. Added to the stopword file's list. */
const QUESTION_WORDS = [
  "which",
  "what",
  "who",
  "whom",
  "whose",
  "when",
  "where",
  "why",
  "how",
  "many",
  "much",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "did",
  "does",
  "do",
  "has",
  "have",
  "had",
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "at",
  "by",
  "for",
  "from",
  "to",
  "with",
  "and",
  "or",
  "as",
  "its",
  "it",
  "this",
  "that",
  "these",
  "those",
  "into",
  "than",
  "then",
  "about",
  "called",
  "known",
  "name",
  "named",
  "first",
  "came",
];

export interface DedupeEntry {
  id: string;
  source: "bank" | "guide";
  /** A bank item from a sealed file. Guide examples are public. */
  sealed: boolean;
  mystery: boolean;
  tokens: Set<string>;
  answerKeys: string[];
}

export interface DedupeMatch {
  nearestId: string | null;
  score: number;
  reason: string;
  /** The nearest entry is a sealed bank item. */
  nearestSealed: boolean;
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1);
  return word;
}

export function contentTokens(
  text: string,
  stopwords: Set<string>,
): Set<string> {
  const out = new Set<string>();
  for (const word of foldedWords(text)) {
    if (word.length < 3 && !/^\d+$/.test(word)) continue;
    if (stopwords.has(word) || QUESTION_WORDS.includes(word)) continue;
    out.add(stem(word));
  }
  return out;
}

type Raw = Record<string, unknown>;
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

function answerTextKey(answer: string): string | null {
  const folded = foldName(answer);
  const letters = folded.replace(/[^a-z]/g, "");
  return letters.length >= 3 ? `text:${folded}` : null;
}

/**
 * The dedupe view of an item, from parsed or raw JSON (the guide's examples
 * are raw). `entityName` resolves a mystery's answer id to its name.
 */
export function dedupeEntry(
  raw: Raw,
  stopwords: Set<string>,
  source: DedupeEntry["source"],
  entityName?: (id: string) => string | undefined,
  sealed = false,
): DedupeEntry | null {
  const id = str(raw.id);
  if (id === "") return null;
  const parts: string[] = [];
  const answerKeys: string[] = [];
  const mystery = raw.kind === "mystery";
  if (mystery) {
    const clues = Array.isArray(raw.clues) ? raw.clues.map(str) : [];
    parts.push(...clues);
    const answerId = str(raw.answer);
    if (answerId) {
      answerKeys.push(`entity:${answerId}`);
      const name =
        entityName?.(answerId) ??
        answerId.replace(/^.*\./, "").replace(/-/g, " ");
      parts.push(name);
      const key = answerTextKey(name);
      if (key) answerKeys.push(key);
    }
  } else if (raw.kind === "encore") {
    parts.push(str(raw.question));
  } else if (raw.format === "comparison") {
    parts.push(str(raw.a), str(raw.b), str(raw.measure));
  } else if (raw.format === "tf") {
    parts.push(str(raw.stem));
  } else if (raw.format === "mc") {
    parts.push(str(raw.stem), str(raw.answer));
    const key = answerTextKey(str(raw.answer));
    if (key) answerKeys.push(key);
  } else {
    return null;
  }
  return {
    id,
    source,
    sealed: source === "bank" && sealed,
    mystery,
    tokens: contentTokens(parts.join(" "), stopwords),
    answerKeys,
  };
}

export interface DedupeIndex {
  entries: DedupeEntry[];
  byToken: Map<string, number[]>;
  byAnswer: Map<string, number[]>;
}

export function buildDedupeIndex(entries: DedupeEntry[]): DedupeIndex {
  const byToken = new Map<string, number[]>();
  const byAnswer = new Map<string, number[]>();
  entries.forEach((entry, i) => {
    for (const token of entry.tokens) {
      const list = byToken.get(token) ?? [];
      list.push(i);
      byToken.set(token, list);
    }
    for (const key of entry.answerKeys) {
      const list = byAnswer.get(key) ?? [];
      list.push(i);
      byAnswer.set(key, list);
    }
  });
  return { entries, byToken, byAnswer };
}

export function pairScore(
  a: DedupeEntry,
  b: DedupeEntry,
): { score: number; reason: string } {
  let inter = 0;
  for (const token of a.tokens) if (b.tokens.has(token)) inter += 1;
  const union = a.tokens.size + b.tokens.size - inter;
  const smaller = Math.min(a.tokens.size, b.tokens.size);
  const jaccard = union === 0 ? 0 : inter / union;
  const containment = smaller >= 3 ? (0.8 * inter) / smaller : 0;
  const text = Math.max(jaccard, containment);
  const sameAnswer = a.answerKeys.some((key) => b.answerKeys.includes(key));
  const sameMystery =
    a.mystery &&
    b.mystery &&
    a.answerKeys.some(
      (key) => key.startsWith("entity:") && b.answerKeys.includes(key),
    );
  let score = sameAnswer ? Math.max(text, 0.5 + 0.5 * text) : text;
  if (sameMystery) score = Math.max(score, 0.9);
  const reasons: string[] = [];
  if (sameMystery) reasons.push("same mystery answer");
  else if (sameAnswer) reasons.push("same answer");
  if (text >= DEDUPE_FLAG) reasons.push("similar wording");
  return {
    score: Math.round(Math.min(1, score) * 1000) / 1000,
    reason: reasons.join(", ") || "low overlap",
  };
}

/** Indexes of entries worth scoring against one entry. */
function candidates(
  index: DedupeIndex,
  entry: DedupeEntry,
  self: number,
): Set<number> {
  const out = new Set<number>();
  const cap = Math.max(50, Math.ceil(index.entries.length * 0.05));
  for (const token of entry.tokens) {
    const list = index.byToken.get(token);
    if (!list || list.length > cap) continue;
    for (const i of list) if (i !== self) out.add(i);
  }
  for (const key of entry.answerKeys) {
    for (const i of index.byAnswer.get(key) ?? []) if (i !== self) out.add(i);
  }
  return out;
}

/**
 * The closest other entry (bank or guide) to entry `self`, among the entries
 * `include` accepts (all by default).
 */
export function nearestTo(
  index: DedupeIndex,
  self: number,
  include: (entry: DedupeEntry) => boolean = () => true,
): DedupeMatch {
  const entry = index.entries[self];
  if (!entry)
    return {
      nearestId: null,
      score: 0,
      reason: "not indexed",
      nearestSealed: false,
    };
  let best: DedupeMatch = {
    nearestId: null,
    score: 0,
    reason: "no overlap",
    nearestSealed: false,
  };
  for (const i of candidates(index, entry, self)) {
    const other = index.entries[i];
    if (!other || other.id === entry.id || !include(other)) continue;
    const { score, reason } = pairScore(entry, other);
    if (
      score > best.score ||
      (score === best.score &&
        best.nearestId !== null &&
        other.id < best.nearestId)
    ) {
      best = {
        nearestId: other.id,
        score,
        reason,
        nearestSealed: other.sealed,
      };
    }
  }
  return best;
}

export interface DedupePair {
  a: string;
  b: string;
  score: number;
  reason: string;
  guide: boolean;
  /** Exactly one side is sealed (the other a plaintext item or an example). */
  crossesSeal: boolean;
  /** The sealed side of a pair that crosses the seal. */
  sealedId?: string;
}

/** True when `entry` is public: a plaintext bank item or a guide example. */
export const isPublicEntry = (entry: DedupeEntry) => !entry.sealed;

/** Every pair at or above `threshold`, bank items first, sorted by score. */
export function flaggedPairs(
  index: DedupeIndex,
  threshold = DEDUPE_FLAG,
): DedupePair[] {
  const pairs: DedupePair[] = [];
  index.entries.forEach((entry, i) => {
    if (entry.source !== "bank") return;
    for (const j of candidates(index, entry, i)) {
      const other = index.entries[j];
      if (!other) continue;
      // Each bank pair once; guide entries pair with bank entries only.
      if (other.source === "bank" && j < i) continue;
      const { score, reason } = pairScore(entry, other);
      if (score < threshold) continue;
      const pair: DedupePair = {
        a: entry.id,
        b: other.id,
        score,
        reason,
        guide: other.source === "guide",
        crossesSeal: entry.sealed !== other.sealed,
      };
      if (pair.crossesSeal) pair.sealedId = entry.sealed ? entry.id : other.id;
      pairs.push(pair);
    }
  });
  return pairs.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a));
}

/**
 * The guide's worked examples: every ```json block that parses to an item
 * (or a list of them). The guide is only read, never written.
 */
export function guideExamples(markdown: string): Raw[] {
  const out: Raw[] = [];
  for (const match of markdown.matchAll(/```json\s*\n([\s\S]*?)```/g)) {
    let value: unknown;
    try {
      value = JSON.parse(match[1] ?? "");
    } catch {
      continue;
    }
    for (const candidate of Array.isArray(value) ? value : [value]) {
      if (candidate && typeof candidate === "object" && "id" in candidate)
        out.push(candidate as Raw);
    }
  }
  return out;
}

/** Answer names for mysteries, from the bank's lists. */
export function entityNamer(
  lists: Iterable<{ entities: Map<string, AnswerEntity> }>,
) {
  return (id: string): string | undefined => {
    for (const list of lists) {
      const entity = list.entities.get(id);
      if (entity) return entity.name;
    }
    return undefined;
  };
}

/**
 * True when `id` (a bank id, or a guide entry's `guide:<id>`) lies in a
 * sealed pool's id space: a mystery, encore or room question. The guide's
 * reserved example ids (batch 00, rooms 90 to 99, such as `e.0004`) have the
 * same shape as sealed ones.
 */
export function namesSealedKind(id: string | null): boolean {
  if (id === null) return false;
  const pool = parseItemId(id.replace(/^guide:/, ""))?.pool;
  return pool === "mystery" || pool === "encore" || pool === "room";
}

/**
 * The verification.dedupe record for an item, safe for the item's own file:
 * a plaintext item never stores a sealed neighbour's id or score, and never
 * any id in a sealed pool's id space, so a nearest guide example of a sealed
 * kind is stored the same way (`nearestId: "sealed"`, `score: null`).
 * content:decide and `content:dedupe -- --write` both write through here.
 */
export function dedupeRecordFor(
  selfSealed: boolean,
  match: DedupeMatch,
  checkedAt: string,
  verdict: "unique" | "related_ok" | "duplicate",
): {
  checkedAt: string;
  nearestId: string | null;
  score: number | null;
  verdict: "unique" | "related_ok" | "duplicate";
} {
  if (
    !selfSealed &&
    (match.nearestSealed || namesSealedKind(match.nearestId))
  ) {
    return { checkedAt, nearestId: SEALED_NEAREST, score: null, verdict };
  }
  return {
    checkedAt,
    nearestId: match.nearestId?.replace(/^guide:/, "") ?? null,
    score: match.score,
    verdict,
  };
}
