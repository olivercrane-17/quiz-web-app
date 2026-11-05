/**
 * C19 (CONTENT_GUIDE §2.13, §3.5): a superlative or "first" word in
 * player-facing text with no high-risk claim behind it is a warning. The
 * words are content/reference/superlatives.json's: first, only, record,
 * most, least, best, worst and the -est words and their kin. Exempt:
 *
 * - the standard comparison stems of §2.6 ("Which came first?", "Which was
 *   invented first?", "Which was completed first?");
 * - "only" followed by a number (after "about" or "around", if present) or
 *   by "a few";
 * - "most of", which is a quantity.
 *
 * As in the pipeline's version, which this one supersedes, any high-risk
 * claim in the item counts as the claim behind the word (the guide's own
 * p.film.0003 backs "first" with date claims), and the Learn more search
 * term is not checked.
 */
import type { AnyItem } from "../../../src/content/schema/items.ts";
import { playerTextFields } from "../../../src/content/pipeline/lint/fields.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";
import { wordSpans } from "../../../src/content/pipeline/text.ts";

const STANDARD_STEMS = /^which (?:came|was (?:invented|completed)) first\?$/i;
const NUMBER_AFTER =
  /^\s+(?:(?:about|around)\s+)?(?:\d|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|half|a dozen|a few)\b)/i;

/** True when the word at `end` is exempt from C19 by what follows it. */
function exemptByContext(word: string, after: string): boolean {
  if (word === "only") return NUMBER_AFTER.test(after);
  if (word === "most") return /^\s+of\b/i.test(after);
  return false;
}

/** C19 for one item. */
export function ruleC19(
  item: AnyItem,
  superlatives: ReadonlySet<string>,
): RuleHit[] {
  if (item.claims.some((claim) => claim.risk === "high")) return [];
  const comparison = !("kind" in item) && item.format === "comparison";
  const hits: RuleHit[] = [];
  for (const field of playerTextFields(item)) {
    if (field.role === "learnMore") continue;
    if (
      comparison &&
      field.role === "stem" &&
      STANDARD_STEMS.test(field.value.trim())
    )
      continue;
    for (const span of wordSpans(field.value)) {
      const word = span.word.toLowerCase();
      if (!superlatives.has(word)) continue;
      if (exemptByContext(word, field.value.slice(span.end))) continue;
      hits.push({
        rule: "C19",
        severity: "warn",
        path: field.path,
        message:
          "superlative or 'first' without a high-risk claim behind it (§3.5)",
        excerpt: span.word,
        match: span.word,
        field: field.value,
      });
    }
  }
  return hits;
}
