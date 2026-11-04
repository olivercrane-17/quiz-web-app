/**
 * Blitz points (ARCHITECTURE §4.6, PRD §3.3.5): a correct answer scores
 * `100 + max(0, round(50 × (1 - t / 8 s)))`, where t runs from the options
 * appearing to the press, measured on the device; a wrong answer scores 0.
 * The run machine applies it under the `blitz` scoring policy.
 *
 * Every run length scores the same way. Decisions memo §14.3 approves a
 * 120-second Relaxed Blitz as a length and leaves the formula alone, so its
 * answers share the 8 s speed window. The optional third argument is that
 * window (`TUNABLES.blitz.speedWindowMs`, which the engine can't read),
 * never the run's length. The bonus is rounded half up in integers, so
 * float noise never moves a boundary (t = 80 ms is exactly 49.5 and scores
 * 50).
 */

/** The speed window (`TUNABLES.blitz.speedWindowMs`), after which a correct answer earns no bonus. */
export const BLITZ_BONUS_WINDOW_MS = 8000;

/** A correct answer's base points, and the most the speed bonus adds. */
export const BLITZ_BASE_POINTS = 100;
export const BLITZ_SPEED_POINTS = 50;

export function blitzPoints(
  tMs: number,
  correct: boolean,
  windowMs: number = BLITZ_BONUS_WINDOW_MS,
): number {
  if (!correct) return 0;
  if (!(windowMs > 0) || !Number.isFinite(windowMs)) {
    throw new RangeError(
      `blitzPoints needs a positive speed window, got ${windowMs}`,
    );
  }
  const t = Math.max(0, tMs);
  // round(50 × (1 - t / W)), half up, is floor((100 × (W - t) + W) / 2W).
  const bonus = Math.floor(
    (2 * BLITZ_SPEED_POINTS * (windowMs - t) + windowMs) / (2 * windowMs),
  );
  return BLITZ_BASE_POINTS + Math.max(0, bonus);
}
