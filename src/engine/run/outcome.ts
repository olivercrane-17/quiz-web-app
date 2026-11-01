/**
 * Outcomes the run machine derives without a plugin: withdrawn (voided)
 * rounds, which never reach a plugin (§8.8), and a fallback from the reveal
 * when a plugin reports none. Share cells follow §4.4.1: a solve on clue k
 * is k - 1 passed, solved, then 4 - k unused; a miss is four passed; a void
 * is four voided.
 */
import type {
  RoundMeta,
  RoundOutcome,
  RoundReveal,
  ShareCell,
} from "../types/rounds.ts";
import type { CategoryId } from "../types/content.ts";

export function mysteryCells(solvedOn: 1 | 2 | 3 | 4 | null): ShareCell[] {
  if (solvedOn === null) return ["passed", "passed", "passed", "passed"];
  const cells: ShareCell[] = [];
  for (let clue = 1; clue <= 4; clue += 1) {
    cells.push(
      clue < solvedOn ? "passed" : clue === solvedOn ? "solved" : "unused",
    );
  }
  return cells;
}

function categoryOf(meta: RoundMeta): CategoryId {
  if (meta.category === null) {
    throw new RangeError(`mystery round ${meta.index} has no category`);
  }
  return meta.category;
}

export function outcomeFromReveal(
  meta: RoundMeta,
  reveal: RoundReveal,
): RoundOutcome {
  switch (reveal.family) {
    case "mystery":
      return {
        family: "mystery",
        solvedOn: reveal.solvedOn,
        points: reveal.points,
        voided: false,
        category: categoryOf(meta),
        cells: mysteryCells(reveal.solvedOn),
      };
    case "encore":
      return {
        family: "encore",
        error: reveal.error,
        band: reveal.band,
        voided: false,
      };
    case "choice":
      return {
        family: "choice",
        correct: reveal.correct,
        points: reveal.points,
        voided: false,
        answerMs: null,
        cells: [reveal.correct ? "correct" : "wrong"],
      };
    case "withdrawn":
      switch (reveal.round) {
        case "mystery":
          return {
            family: "mystery",
            solvedOn: null,
            points: reveal.points,
            voided: true,
            category: categoryOf(meta),
            cells: ["voided", "voided", "voided", "voided"],
          };
        case "encore":
          return { family: "encore", error: null, band: null, voided: true };
        case "choice":
          return {
            family: "choice",
            correct: false,
            points: reveal.points,
            voided: true,
            answerMs: null,
            cells: ["voided"],
          };
        case "ordering":
          throw new RangeError("ordering rounds are not supported in v1");
      }
  }
}

/** Points a resolved round adds to the run under the sealed and practice policies. */
export function outcomePoints(outcome: RoundOutcome): number {
  return outcome.family === "encore" ? 0 : outcome.points;
}

/** A wrong verdict, which costs a strike: a wrong choice or a missed mystery. */
export function isWrongOutcome(outcome: RoundOutcome): boolean {
  if (outcome.voided) return false;
  if (outcome.family === "choice") return !outcome.correct;
  if (outcome.family === "mystery") return outcome.solvedOn === null;
  return false;
}
