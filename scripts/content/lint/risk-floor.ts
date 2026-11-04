/**
 * C26, the risk floor (CONTENT_GUIDE §2.13, §9.2). A claim must be `high`
 * when:
 *
 * - its text holds a digit or a number word (zero to twenty, the tens,
 *   hundred, thousand, million, billion and their plurals, dozen, half);
 * - it puts quotation marks around a word or phrase;
 * - it holds a superlative from C19's list (content/reference/
 *   superlatives.json), "only", "first", "invented", "named after",
 *   "comes from" or "means";
 * - it is the key claim of a counterintuitive item (for a comparison, both
 *   label claims);
 * - it is a clue, value or input claim in a sealed pool.
 *
 * Three things don't count: a number word capitalized mid-sentence, which
 * belongs to a title (The Four Seasons); digits that only number clues
 * ("contradicts clues 1 and 4"); and "most of", a quantity. Uniqueness
 * claims are exempt, because the rival search proves them (§5.4). Writers
 * may raise risk, never set it below this floor.
 */
import type { AnyItem } from "../../../src/content/schema/items.ts";
import type { RiskReason } from "../../../src/content/schema/claims.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";
import { wordSpans } from "../../../src/content/pipeline/text.ts";

const NUMBER_WORDS = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "hundreds",
  "thousand",
  "thousands",
  "million",
  "millions",
  "billion",
  "billions",
  "dozen",
  "dozens",
  "half",
]);

/** "clue 2", "clues 1 and 4", "clues 1, 2 and 3", "clues 1 to 3". */
const CLUE_NUMBERS = /\bclues?\s+\d+(?:\s*(?:,|and|or|to|-)\s*\d+)*/gi;

/** 'a phrase', "a phrase", ‘a phrase’ or “a phrase”, never an apostrophe. */
const QUOTED = [
  /(?:^|[\s(])'[^'\s][^']*'(?=$|[\s.,;:!?)])/u,
  /"[^"]+"/u,
  /‘[^’]+’/u,
  /“[^”]+”/u,
];

/** The triggers that are words or phrases, with the reason §9.2 maps each to. */
const PHRASES: readonly [RegExp, string, RiskReason][] = [
  [/\binvented\b/i, "invented", "first"],
  [/\bnamed after\b/i, "named after", "etymology"],
  [/\bcomes from\b/i, "comes from", "etymology"],
  [/\bmeans\b/i, "means", "etymology"],
];

export interface FloorTrigger {
  /** What tripped the floor, in plain words. */
  what: string;
  /** The riskReason §9.2 maps it to. */
  reason: RiskReason;
  /** The word or phrase, for the excerpt. */
  match?: string;
}

function sentenceStart(textValue: string, start: number): boolean {
  const before = textValue.slice(0, start).trimEnd();
  return before === "" || /[.!?:;]$/.test(before);
}

/** Why a claim's text must be high-risk, or null when nothing in it is. */
export function textTrigger(
  claimText: string,
  superlatives: ReadonlySet<string>,
): FloorTrigger | null {
  const withoutClueNumbers = claimText.replace(CLUE_NUMBERS, (span) =>
    span.replace(/\d/g, "#"),
  );
  const digit = /\d/.exec(withoutClueNumbers);
  if (digit) return { what: "a digit", reason: "number", match: digit[0] };

  for (const span of wordSpans(claimText)) {
    const word = span.word.toLowerCase();
    if (NUMBER_WORDS.has(word)) {
      const titleCase =
        /^\p{Lu}/u.test(span.word) && !sentenceStart(claimText, span.start);
      if (!titleCase)
        return { what: "a number word", reason: "number", match: span.word };
    }
  }

  for (const pattern of QUOTED) {
    const quoted = pattern.exec(claimText);
    if (quoted)
      return {
        what: "quotation marks around a word or phrase",
        reason: "quotation",
        match: quoted[0].trim(),
      };
  }

  for (const span of wordSpans(claimText)) {
    const word = span.word.toLowerCase();
    if (!superlatives.has(word)) continue;
    if (word === "most" && /^\s+of\b/i.test(claimText.slice(span.end)))
      continue;
    const reason: RiskReason =
      word === "first" ? "first" : word === "only" ? "only" : "superlative";
    return {
      what: word === "first" || word === "only" ? `"${word}"` : "a superlative",
      reason,
      match: span.word,
    };
  }

  for (const [pattern, what, reason] of PHRASES) {
    const found = pattern.exec(claimText);
    if (found) return { what: `"${what}"`, reason, match: found[0] };
  }
  return null;
}

function isSealedPool(item: AnyItem): boolean {
  return "kind" in item;
}

/** C26 over every claim of one item. */
export function ruleC26(
  item: AnyItem,
  superlatives: ReadonlySet<string>,
): RuleHit[] {
  const hits: RuleHit[] = [];
  const comparison = !("kind" in item) && item.format === "comparison";
  item.claims.forEach((claim, index) => {
    if (claim.risk === "high" || claim.role === "uniqueness") return;
    let trigger: FloorTrigger | null = null;
    if (
      item.counterintuitive &&
      (claim.role === "key" || (comparison && claim.role === "label"))
    ) {
      trigger = {
        what: comparison
          ? "a label claim of a counterintuitive comparison"
          : "the key claim of a counterintuitive item",
        reason: "counterintuitive",
      };
    } else if (
      isSealedPool(item) &&
      (claim.role === "clue" ||
        claim.role === "value" ||
        claim.role === "input")
    ) {
      trigger = {
        what: `a ${claim.role} claim in a sealed pool`,
        reason: "sealed_pool",
      };
    } else {
      trigger = textTrigger(claim.text, superlatives);
    }
    if (trigger === null) return;
    const hit: RuleHit = {
      rule: "C26",
      severity: "error",
      path: `claims[${index}].risk`,
      message: `claim ${claim.id} is below the risk floor: ${trigger.what} makes it high-risk (riskReason ${trigger.reason}, §2.13 C26, §9.2); writers may raise risk, never set it below the floor`,
    };
    if (trigger.match !== undefined) {
      hit.excerpt = trigger.match;
      hit.match = trigger.match;
    }
    hits.push(hit);
  });
  return hits;
}
