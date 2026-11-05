/**
 * Mystery scoring (ARCHITECTURE §4.6, PRD §4.1.2, §3.13.4).
 *
 * A solve on clue k scores `5 - k`, a miss scores 0, and a voided Mystery
 * scores 4 for everyone. A wrong guess costs exactly what Next clue costs:
 * either one moves to the next clue, and the Mystery is then worth one
 * point less, which is what the stake indicator shows.
 *
 * Share cells follow §4.4.1 (`k - 1` passed, solved, `4 - k` unused; a miss
 * is four passed; a void is four voided). The run machine's outcome
 * fallback already builds them, so this module re-exports that one copy.
 */
import { mysteryCells } from "../run/outcome.ts";

export { mysteryCells };

export type ClueNumber = 1 | 2 | 3 | 4;

/** A solve on clue 1. */
export const MYSTERY_MAX_POINTS = 4;

/** What a voided (withdrawn) Mystery scores for every attempt (PRD §3.13.4). */
export const VOIDED_MYSTERY_POINTS = 4;

/** Points for a Mystery: `5 - k` when solved on clue k, 0 when missed, 4 when voided. */
export function mysteryPoints(
  solvedOn: ClueNumber | null,
  voided = false,
): number {
  if (voided) return VOIDED_MYSTERY_POINTS;
  return solvedOn === null ? 0 : 5 - solvedOn;
}

/** What a solve on the current clue would score: the stake indicator's marked value. */
export function worthOnClue(clue: ClueNumber): number {
  return 5 - clue;
}

/** The clue a wrong guess, a wrong early pick or Next clue issues. */
export function nextClueNumber(clue: 1 | 2 | 3): 2 | 3 | 4 {
  return clue === 1 ? 2 : clue === 2 ? 3 : 4;
}

/** Narrows a number to a clue number, or null. */
export function asClueNumber(value: number): ClueNumber | null {
  return value === 1 || value === 2 || value === 3 || value === 4
    ? value
    : null;
}
