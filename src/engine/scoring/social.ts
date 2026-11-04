/**
 * Head-to-head verdicts and the Group week (ARCHITECTURE §4.6; PRD §3.6.2,
 * §3.7.2).
 *
 * - **Head-to-head** follows the Daily ranking key (points, then the Encore
 *   error, then time) and reports which key decided, so the copy can say
 *   "You win on the Encore: 4% off against 9%." or "Dead heat." (AC-CHL-05).
 * - **The week** ranks by points, then days played; members equal on both
 *   share the rank. Last week's banner names everyone tied on the top
 *   points (AC-GRP-15), and nobody when nobody scored.
 */
import type { HeadToHead } from "../types/social.ts";
import {
  rankBy,
  rankDifference,
  type RankFacts,
  type RankedEntry,
} from "./ranking.ts";

export type HeadToHeadVerdict = HeadToHead["verdict"];

/** The verdict from your side: `you` against `them`. */
export function headToHead(you: RankFacts, them: RankFacts): HeadToHeadVerdict {
  const { decidedBy, order } = rankDifference(you, them);
  return {
    winner: order < 0 ? "you" : order > 0 ? "them" : "tie",
    decidedBy,
  };
}

/** What the week ranking reads from a member's row. */
export interface WeekFacts {
  points: number;
  daysPlayed: number;
}

export function compareWeek(a: WeekFacts, b: WeekFacts): number {
  return b.points - a.points || b.daysPlayed - a.daysPlayed;
}

/** The This week tab's order and ranks ("=2"). Ties keep their input order. */
export function rankWeek<T extends WeekFacts>(
  rows: readonly T[],
): RankedEntry<T>[] {
  return rankBy(rows, compareWeek);
}

/** Everyone tied on the top points, for "Last week: Dee won with 71 points."; null when nobody scored. */
export function weekLeaders<T extends WeekFacts>(
  rows: readonly T[],
): { rows: T[]; points: number } | null {
  let top = 0;
  for (const row of rows) top = Math.max(top, row.points);
  if (top <= 0) return null;
  return { rows: rows.filter((row) => row.points === top), points: top };
}
