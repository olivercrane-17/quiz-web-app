/**
 * Text rules that look at one field at a time: C05, C06, C08, C09, C10,
 * C11, C19, C20, C21 and C23.
 */
import type { AnyItem } from "../../schema/items.ts";
import type { References } from "../references.ts";
import { escapeRegExp, wordSpans } from "../text.ts";
import {
  allItemStrings,
  choiceOptions,
  isRoomQuestion,
  playerTextFields,
  type TextField,
} from "./fields.ts";
import type { RuleHit } from "./types.ts";

function hit(
  rule: string,
  severity: RuleHit["severity"],
  field: TextField,
  message: string,
  match?: string,
): RuleHit {
  const out: RuleHit = {
    rule,
    severity,
    path: field.path,
    message,
    field: field.value,
  };
  if (match !== undefined) {
    out.match = match;
    out.excerpt = match;
  }
  return out;
}

/** C05 (L1): no all/none of the above, both or neither as an option. */
const ABOVE = /\b(?:all|none) (?:of )?(?:the )?(?:above|these|them)\b/i;
const BOTH_NEITHER =
  /^(?:both|neither)(?: of (?:these|them|the above|the two))?$|^(?:both|neither) [a-d1-4] (?:and|nor) [a-d1-4]$/i;

export function ruleC05(item: AnyItem): RuleHit[] {
  const options = choiceOptions(item);
  if (!options) return [];
  const paths = ["answer", ...options.slice(1).map((_, i) => `wrong[${i}]`)];
  const hits: RuleHit[] = [];
  options.forEach((option, i) => {
    const normalized = option.trim().replace(/[.!]$/, "");
    if (ABOVE.test(normalized) || BOTH_NEITHER.test(normalized)) {
      hits.push({
        rule: "C05",
        severity: "error",
        path: paths[i] ?? "",
        message:
          "no 'all of the above', 'none of the above', 'both' or 'neither' options (L1, §3.6)",
        excerpt: option,
      });
    }
  });
  return hits;
}

/** C06 (L2): negative words in stems and statements; a warning in clues. */
const NEGATION = /\b(?:not|never|except|isn't)\b/gi;

export function ruleC06(item: AnyItem): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const field of playerTextFields(item)) {
    const isStem =
      field.role === "stem" ||
      field.role === "statement" ||
      field.role === "question";
    if (!isStem && field.role !== "clue") continue;
    for (const match of field.value.matchAll(NEGATION)) {
      hits.push(
        hit(
          "C06",
          isStem ? "error" : "warn",
          field,
          isStem
            ? `negative word in the ${field.role}: ask it the other way round (L2, §3.6)`
            : "negative word in a clue: check it reads clearly (L2)",
          match[0],
        ),
      );
    }
  }
  return hits;
}

/** C08 (L6): numeric dates. */
const NUMERIC_DATES = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  /\b\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\b/g,
];
const SHORT_DATE = /\b(\d{1,2})\/(\d{1,2})\b/g;

export function ruleC08(item: AnyItem): RuleHit[] {
  const hits: RuleHit[] = [];
  const message =
    "write dates with the month spelled out, like 3 April 1968 (L6, §3.3)";
  for (const field of playerTextFields(item)) {
    const seen = new Set<number>();
    for (const pattern of NUMERIC_DATES) {
      for (const match of field.value.matchAll(pattern)) {
        seen.add(match.index);
        hits.push(hit("C08", "error", field, message, match[0]));
      }
    }
    for (const match of field.value.matchAll(SHORT_DATE)) {
      if (seen.has(match.index)) continue;
      const [, first = "", second = ""] = match;
      const padded = (part: string) =>
        part.length === 2 && part.startsWith("0");
      if (
        padded(first) ||
        padded(second) ||
        (first.length === 2 && second.length === 2)
      ) {
        hits.push(hit("C08", "error", field, message, match[0]));
      }
    }
  }
  return hits;
}

/** C09 (L7 and more): time words. */
const TIME_WORDS =
  /\b(?:current|currently|latest|now|today|this year|recent|recently|newest|reigning|so far|to date|as of)\b/gi;

export function ruleC09(item: AnyItem): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const field of playerTextFields(item)) {
    for (const match of field.value.matchAll(TIME_WORDS)) {
      hits.push(
        hit(
          "C09",
          "error",
          field,
          "time word: nothing that can change, or date it in the text (L7, §3.4)",
          match[0],
        ),
      );
    }
  }
  return hits;
}

/** Spans inside single-quoted quotations, which keep their own spelling. */
function quotedSpans(value: string): [number, number][] {
  const spans: [number, number][] = [];
  const pattern = /(^|[\s(])'([^']+)'(?=$|[\s.,;:!?)])/g;
  for (const match of value.matchAll(pattern)) {
    const start = match.index + (match[1]?.length ?? 0);
    spans.push([start, start + (match[2]?.length ?? 0) + 2]);
  }
  return spans;
}

/** C10: US spellings (and -ise forms) outside proper nouns and quotations. */
export function ruleC10(item: AnyItem, refs: References): RuleHit[] {
  if (refs.spelling.size === 0) return [];
  const hits: RuleHit[] = [];
  for (const field of playerTextFields(item)) {
    if (field.role === "learnMore") continue;
    const allowed: [number, number][] = quotedSpans(field.value);
    for (const noun of refs.properNouns) {
      for (const match of field.value.matchAll(
        new RegExp(escapeRegExp(noun), "g"),
      )) {
        allowed.push([match.index, match.index + match[0].length]);
      }
    }
    for (const span of wordSpans(field.value)) {
      const entry = refs.spelling.get(span.word.toLowerCase());
      if (!entry) continue;
      if (
        allowed.some(([start, end]) => span.start >= start && span.end <= end)
      )
        continue;
      // A capital in mid-sentence marks a proper noun (Mr Gray, Labor Day).
      const before = field.value.slice(0, span.start).trimEnd();
      const sentenceStart = before === "" || /[.!?:]$/.test(before);
      if (/^\p{Lu}/u.test(span.word) && !sentenceStart) continue;
      hits.push(
        hit(
          "C10",
          "warn",
          field,
          `${entry.kind === "us" ? "US" : "-ise"} spelling: Oxford spelling is "${entry.right}" (§3.3)`,
          span.word,
        ),
      );
    }
  }
  return hits;
}

/** C11: dashes, spacing, URLs, HTML, Markdown and emoji. */
const C11_ERRORS: [RegExp, string][] = [
  [/[‐-―−]/g, "use a plain hyphen, never an en or em dash (§2.1)"],
  [/ {2,}/g, "double space (§2.1)"],
  [/^\s+|\s+$/g, "leading or trailing whitespace (§2.1)"],
  [/[\n\r\t]/g, "line breaks and tabs are not plain text (§2.1)"],
  [
    /\bhttps?:\/\/\S*|\bwww\.[a-z0-9-]+\.\S*/gi,
    "no URLs in player text; Learn more is built from learnMore (§2.1, §9.6)",
  ],
  [
    /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi,
    "no HTML (§2.1)",
  ],
  [
    /\*\*|__|`|\[[^\]]*\]\([^)]*\)|^#{1,6}\s|^\s*[-*+>]\s/g,
    "no Markdown (§2.1)",
  ],
  // Single-asterisk or underscore emphasis: *heron*, _heron_.
  [/(?<=^|[\s(])[*_][^*_\s][^*_]*[*_](?=$|[\s.,;:!?)])/g, "no Markdown (§2.1)"],
  [/(?![©®™])\p{Extended_Pictographic}/gu, "no emoji (§2.1)"],
];
const C11_WARNINGS: [RegExp, string][] = [
  [/[‘’“”]/g, "use straight apostrophes and single quotation marks (§2.1)"],
  [/"/g, "use single quotation marks, so JSON needs no escaping (§2.1)"],
];

export function ruleC11(item: AnyItem): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const field of playerTextFields(item)) {
    const messages = new Set<string>();
    for (const [pattern, message] of C11_ERRORS) {
      const match = field.value.match(
        new RegExp(pattern.source, pattern.flags.replace("g", "")),
      );
      // One finding per field and kind of problem.
      if (match && !messages.has(message)) {
        messages.add(message);
        hits.push(hit("C11", "error", field, message, match[0]));
      }
    }
    for (const [pattern, message] of C11_WARNINGS) {
      const match = field.value.match(
        new RegExp(pattern.source, pattern.flags.replace("g", "")),
      );
      if (match) hits.push(hit("C11", "warn", field, message, match[0]));
    }
  }
  return hits;
}

/**
 * C19: superlatives and "first" words need a high-risk claim behind them
 * (§2.13: "without a high-risk claim"). Any high-risk claim counts, whatever
 * its riskReason: the guide's own p.film.0003 backs "first" with date claims.
 */
const SUPERLATIVES =
  /\b(?:first|only|largest|biggest|oldest|tallest|longest|most|highest|fastest|record)\b/gi;

export function ruleC19(item: AnyItem): RuleHit[] {
  const covered = item.claims.some((claim) => claim.risk === "high");
  if (covered) return [];
  const hits: RuleHit[] = [];
  for (const field of playerTextFields(item)) {
    // A comparison's stem names its relation ("Which came first?").
    if (
      field.role === "stem" &&
      "format" in item &&
      item.format === "comparison"
    )
      continue;
    if (field.role === "learnMore") continue;
    for (const match of field.value.matchAll(SUPERLATIVES)) {
      hits.push(
        hit(
          "C19",
          "warn",
          field,
          "superlative or 'first' without a high-risk claim behind it (§3.5)",
          match[0],
        ),
      );
    }
  }
  return hits;
}

/** C20: the bare word football. */
export function ruleC20(item: AnyItem): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const field of playerTextFields(item)) {
    if (field.role === "learnMore") continue;
    for (const match of field.value.matchAll(/\bfootball\b/gi)) {
      const before = field.value.slice(0, match.index);
      const after = field.value.slice(match.index + match[0].length);
      if (/^\s*\(soccer\)/i.test(after)) continue;
      if (
        /\b(?:american|australian rules|gaelic|canadian|association|rugby)\s+$/i.test(
          before,
        )
      )
        continue;
      hits.push(
        hit(
          "C20",
          "warn",
          field,
          "write football (soccer), American football, or name the competition (§3.3)",
          match[0],
        ),
      );
    }
  }
  return hits;
}

/** C21: ambiguous units; temperatures in an encore. */
const AMBIGUOUS_UNITS =
  /\b(?:tons?|gallons?|ounces?|pints?|cups?|calories?)\b/gi;
const TEMPERATURE = /°\s?[CF]\b|\b(?:celsius|fahrenheit|degrees?)\b/gi;

export function ruleC21(item: AnyItem): RuleHit[] {
  const encore = "kind" in item && item.kind === "encore";
  const hits: RuleHit[] = [];
  for (const field of playerTextFields(item)) {
    if (field.role === "learnMore") continue;
    for (const match of field.value.matchAll(AMBIGUOUS_UNITS)) {
      // "World Cup", "Davis Cup": a competition, not a unit.
      if (/^Cups?$/.test(match[0])) continue;
      hits.push(
        hit(
          "C21",
          encore ? "error" : "warn",
          field,
          "ambiguous unit: tons, gallons, ounces, pints, cups and calories mean different things in different places (§3.3)",
          match[0],
        ),
      );
    }
    if (encore && field.path !== "unit") {
      for (const match of field.value.matchAll(TEMPERATURE)) {
        hits.push(
          hit(
            "C21",
            "error",
            field,
            "no temperatures or degrees in an encore: bands need a true zero (§6 rules 3 and 4)",
            match[0],
          ),
        );
      }
    }
  }
  return hits;
}

/** C23: the shared slur list. The term is never repeated in the message. */
export function ruleC23(item: AnyItem, refs: References): RuleHit[] {
  if (refs.slurs.size === 0) return [];
  const hits: RuleHit[] = [];
  for (const field of allItemStrings(item)) {
    if (refs.slurs.test(field.value)) {
      hits.push({
        rule: "C23",
        severity: "error",
        path: field.path,
        message:
          "contains a term from the shared slur list (PRD §3.9.4). The term is not printed.",
      });
    }
  }
  return hits;
}

/** C23 for any free strings, such as list entries and pack titles. */
export function slurHits(
  values: { path: string; value: string }[],
  refs: References,
): RuleHit[] {
  if (refs.slurs.size === 0) return [];
  return values
    .filter((entry) => refs.slurs.test(entry.value))
    .map((entry) => ({
      rule: "C23",
      severity: "error" as const,
      path: entry.path,
      message:
        "contains a term from the shared slur list (PRD §3.9.4). The term is not printed.",
    }));
}

export function isRoom(item: AnyItem): boolean {
  return isRoomQuestion(item);
}
