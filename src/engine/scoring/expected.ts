/**
 * A Mystery's expected points (ARCHITECTURE §3.2, CONTENT_GUIDE §8.3): a
 * solve on clue k earns 5 - k, so with `s1` to `s4` the cumulative shares
 * solving by each clue, E = s1 + s2 + s3 + s4. The Daily assembler, the
 * content checks and the schedule's windows (3.2 to 3.6 for Mystery 1, and
 * so on) read it.
 *
 * The sum is rounded to 9 decimal places, which removes binary floating
 * point's noise (0.8 four times is 3.2000000000000006 as a float) so a
 * window check at 3.2 or 3.6 behaves as written. Shares are stored to 3
 * places, so nothing real is lost.
 */
import type { MysteryPrediction } from "../types/content.ts";

const SCALE = 1e9;

export function expectedPoints(
  predicted: Pick<MysteryPrediction, "solveByClue">,
): number {
  const [s1, s2, s3, s4] = predicted.solveByClue;
  return Math.round((s1 + s2 + s3 + s4) * SCALE) / SCALE;
}

/** A Daily's predicted points: the sum over its Mysteries (the schedule's `predictedPoints`). */
export function expectedDailyPoints(
  predictions: readonly Pick<MysteryPrediction, "solveByClue">[],
): number {
  const sum = predictions.reduce(
    (total, predicted) => total + expectedPoints(predicted),
    0,
  );
  return Math.round(sum * SCALE) / SCALE;
}
