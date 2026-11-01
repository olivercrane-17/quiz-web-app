/**
 * Difficulty bands by predicted correct rate p (PRD §3.3.3, AC-PRA-08):
 * Easy p >= 0.75, Medium 0.45 <= p < 0.75, Hard p < 0.45. The thresholds
 * are tunable and live in src/config/tunables.ts, which the engine may not
 * import; callers pass them in, and a test keeps these defaults equal to
 * the config.
 */
import type { DifficultyBand } from "../types/content.ts";
import type { PracticeBands, PracticeRamp } from "./types.ts";

export const DEFAULT_PRACTICE_BANDS: Readonly<PracticeBands> = Object.freeze({
  easyMinP: 0.75,
  hardMaxP: 0.45,
});

export const DEFAULT_PRACTICE_RAMP: Readonly<PracticeRamp> = Object.freeze({
  easyThrough: 5,
  mediumThrough: 12,
});

export function difficultyBandOf(
  p: number,
  bands: PracticeBands = DEFAULT_PRACTICE_BANDS,
): DifficultyBand {
  if (p >= bands.easyMinP) return "easy";
  if (p < bands.hardMaxP) return "hard";
  return "medium";
}

/** The band Survival's ramp serves at a 1-based position. */
export function rampBandAt(
  position: number,
  ramp: PracticeRamp = DEFAULT_PRACTICE_RAMP,
): DifficultyBand {
  if (position <= ramp.easyThrough) return "easy";
  if (position <= ramp.mediumThrough) return "medium";
  return "hard";
}
