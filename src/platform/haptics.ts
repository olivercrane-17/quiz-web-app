/**
 * Extension point (ARCHITECTURE §2.3): haptics (DESIGN §9). Only Chromium
 * on Android vibrates, after a user gesture; it is an extra behind a
 * setting that is off by default, and nothing depends on it. Nothing
 * vibrates during the read beat or the explanation.
 *
 * A stub until SND-1: `vibrate` does nothing. SND-1 fills it (the setting,
 * the user-gesture rule) and keeps the signature. `isHapticsSupported` is
 * real already, because the Settings row only appears where the API exists
 * (AC-SET-07).
 */

/** The patterns of DESIGN §9, in milliseconds. */
export const HAPTICS = {
  lockIn: 10,
  correct: 20,
  wrong: [30, 40, 30],
  milestone: [20, 60, 20],
} as const satisfies Record<string, number | readonly number[]>;

export type HapticPattern = number | readonly number[];

export function vibrate(_pattern: HapticPattern): void {
  // No haptics until SND-1.
}

/** True where `navigator.vibrate` exists. */
export function isHapticsSupported(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    );
  } catch {
    return false;
  }
}
