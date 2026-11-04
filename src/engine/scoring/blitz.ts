/**
 * Blitz points (ARCHITECTURE §4.6, PRD §3.3.5, decisions memo §14.3). A
 * correct answer scores `100 + max(0, round(50 × (1 - t / W)))`, where t
 * runs from the options appearing to the press, measured on the device; a
 * wrong answer scores 0. The run machine applies it under the `blitz`
 * scoring policy.
 *
 * The speed window W scales with the run's length: 8 s for every 60 s of
 * run, so the 60-second Blitz keeps the PRD's 8 s (AC-BLZ-02) and memo
 * §14.3's 120-second Relaxed Blitz gets 16 s, the same bonus for the same
 * share of the clock. The bonus is rounded half up in integers, so float
 * noise never moves a boundary (t = 80 ms is exactly 49.5 and scores 50).
 * Without a run length the standard 60 seconds apply, which is what the
 * run reducer passes until Blitz runs carry their length (BLZ-1).
 */

/** The standard run (`blitz_seconds`, 60 at launch). */
export const BLITZ_STANDARD_RUN_MS = 60_000;

/** Memo §14.3's Relaxed Blitz. */
export const BLITZ_RELAXED_RUN_MS = 120_000;

/** The standard run's speed window, after which a correct answer earns no bonus. */
export const BLITZ_BONUS_WINDOW_MS = 8000;

/** A correct answer's base points, and the most the speed bonus adds. */
export const BLITZ_BASE_POINTS = 100;
export const BLITZ_SPEED_POINTS = 50;

/** The speed window for a run of `runMs`: 8 s per 60 s. */
export function blitzBonusWindowMs(
  runMs: number = BLITZ_STANDARD_RUN_MS,
): number {
  return (BLITZ_BONUS_WINDOW_MS * runMs) / BLITZ_STANDARD_RUN_MS;
}

export function blitzPoints(
  tMs: number,
  correct: boolean,
  runMs: number = BLITZ_STANDARD_RUN_MS,
): number {
  if (!correct) return 0;
  if (!(runMs > 0) || !Number.isFinite(runMs)) {
    throw new RangeError(
      `blitzPoints needs a positive run length, got ${runMs}`,
    );
  }
  const t = Math.max(0, tMs);
  // With W = 8000 × R / 60000, round(50 × (1 - t / W)) is
  // round(50 × (2R - 15t) / 2R), which is floor((100 × (2R - 15t) + 2R) / 4R).
  const twiceRun = 2 * runMs;
  const bonus = Math.floor(
    (2 * BLITZ_SPEED_POINTS * (twiceRun - 15 * t) + twiceRun) / (2 * twiceRun),
  );
  return BLITZ_BASE_POINTS + Math.max(0, bonus);
}
