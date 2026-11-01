/**
 * Blitz points (ARCHITECTURE §4.6, PRD §3.3.5): a correct answer scores
 * `100 + max(0, round(50 × (1 - t / 8 s)))`, where t runs from the options
 * appearing to the press, measured on the device; a wrong answer scores 0.
 * The run machine applies it under the `blitz` scoring policy. ENG-2 owns
 * the scoring tables (AC-BLZ-02) from Wave 2.
 */

/** The time after which a correct Blitz answer earns no speed bonus. */
export const BLITZ_BONUS_WINDOW_MS = 8000;

export function blitzPoints(tMs: number, correct: boolean): number {
  if (!correct) return 0;
  const t = Math.max(0, tMs);
  return 100 + Math.max(0, Math.round(50 * (1 - t / BLITZ_BONUS_WINDOW_MS)));
}
