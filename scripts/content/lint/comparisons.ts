/**
 * C17's `exactDates` (CONTENT_GUIDE §2.6, §2.13). Two dates under 10 years
 * apart pass the separation guard only when both are exact, undisputed days
 * at least 365 days apart, recorded in `exactDates`, and each side's label
 * claim states its day in words ("Dr. No premiered in London on 5 October
 * 1962."). The schema already ties each exact date's year to its value.
 *
 * The pipeline's C17 refuses every near-tie and lets the editor waive it
 * with a lintAllow; this module reads `exactDates` instead, so a near-tie
 * that meets the guard passes without one (`passesNearTie`), and one that
 * misses it says why.
 */
import type {
  AnyItem,
  ComparisonItem,
} from "../../../src/content/schema/items.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";

const DATE_RELATIONS = new Set(["earlier", "later"]);
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_MS = 86_400_000;

/** A year comparison, as the pipeline's C17 decides it. */
export function isYearComparison(item: ComparisonItem): boolean {
  return (
    DATE_RELATIONS.has(item.relation) || item.unit.toLowerCase() === "year"
  );
}

function comparisonOf(item: AnyItem): ComparisonItem | null {
  return !("kind" in item) && item.format === "comparison" ? item : null;
}

/** Days between two ISO dates, or null for a date JavaScript can't place. */
function daysApart(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round(Math.abs(ta - tb) / DAY_MS);
}

/** True when a claim states the day of an ISO date in words: "5 October 1962". */
export function statesDay(claimText: string, isoDate: string): boolean {
  const [year = "", month = "", day = ""] = isoDate.split("-");
  const name = MONTHS[Number(month) - 1];
  if (name === undefined) return false;
  const d = String(Number(day));
  const dayMonth = new RegExp(
    `\\b(?:${d}(?:st|nd|rd|th)? ${name}|${name} ${d}(?:st|nd|rd|th)?)\\b`,
    "i",
  );
  return dayMonth.test(claimText) && claimText.includes(String(Number(year)));
}

interface NearTie {
  /** The near-tie meets the guard, so the pipeline's refusal is lifted. */
  passes: boolean;
  hits: RuleHit[];
}

/** C17 for a comparison's dates; null when the item isn't a near-tie of years. */
export function nearTieDates(item: AnyItem): NearTie | null {
  const c = comparisonOf(item);
  if (c === null || !isYearComparison(c)) return null;
  const { a, b } = c.values;
  const gap = Math.abs(a - b);
  const hits: RuleHit[] = [];
  if (gap >= 10 || a === b || !Number.isInteger(a) || !Number.isInteger(b)) {
    if (c.exactDates !== undefined && gap >= 10)
      hits.push({
        rule: "C17",
        severity: "warn",
        path: "exactDates",
        message:
          "exactDates belongs only on two years under 10 apart; omit it (§2.6)",
      });
    return hits.length > 0 ? { passes: false, hits } : null;
  }
  if (c.exactDates === undefined) return { passes: false, hits };
  const exact = c.exactDates;
  const days = daysApart(exact.a, exact.b);
  if (days === null || days < 365) {
    hits.push({
      rule: "C17",
      severity: "error",
      path: "exactDates",
      message:
        "two exact days under 10 years apart must be at least 365 days apart (§2.6)",
    });
  }
  // Each side's day, stated in words by its label claim.
  for (const side of ["a", "b"] as const) {
    const index = c.claims.findIndex(
      (claim) => claim.role === "label" && claim.ref === side,
    );
    const claim = c.claims[index];
    if (claim === undefined) continue; // The schema reports a missing label claim.
    if (!statesDay(claim.text, exact[side])) {
      hits.push({
        rule: "C17",
        severity: "error",
        path: `claims[${index}].text`,
        message: `the label claim for side ${side} states its exact day in words, as exactDates.${side} records it (§2.6)`,
      });
    }
  }
  return { passes: hits.length === 0, hits };
}
