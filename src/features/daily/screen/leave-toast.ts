/**
 * Leave's words and its toast (RITE round 1, R1-38; round 2, R2-01;
 * DESIGN §6.9; decision D19).
 *
 * - **The words.** A round's time runs while its clue or the Encore is open,
 *   even with the Daily closed, and stops on every reveal (PRD §4.1.4). So
 *   leaving with a clue or the Encore open, the X is named "Leave the Daily.
 *   Your progress is saved, and the stopwatch keeps running." and the toast
 *   says "Saved. The stopwatch keeps running."; leaving from a reveal, the
 *   X keeps "Leave the Daily. Your progress is saved." and the toast
 *   "Saved". "Saved" alone read as a pause to Priya and Marcus in round 2,
 *   and Marcus came back to five more minutes on his clock (`leaveWords`).
 * - **The toast** is the design system's (`@/ui/toast`): one at a time,
 *   4 s, tap to dismiss, its words kept in the status region through the
 *   change of address. Leave navigates, and the toast sits 16 px above the
 *   bar it finds when it is shown, so it waits until the address has
 *   changed and the next screen is in place: then it rises above Today's
 *   tab bar rather than the Daily's empty bottom edge. Call it from an
 *   event handler or an effect.
 */
import type { RunState } from "@/engine/run";
import { showToast } from "@/ui/toast";

import { DAILY_SCREEN_COPY } from "../client-copy";
import { clockRunning } from "../model/labels";

/** The longest a toast waits for the navigation that called it. */
export const TOAST_WAIT_MS = 2_000;

/** What Leave says: the X's accessible name, and the toast it leaves behind (null: none). */
export interface LeaveWords {
  label: string;
  toast: string | null;
}

/**
 * Leave's words for the run as it stands (D19). Only a Daily in play saves
 * anything worth a toast; one still starting, or that couldn't start, just
 * goes back to Today.
 */
export function leaveWords(run: RunState | null, playing: boolean): LeaveWords {
  const running = playing && clockRunning(run);
  const words = DAILY_SCREEN_COPY;
  return {
    label: running ? words.leave.running : words.leave.stopped,
    toast: !playing
      ? null
      : running
        ? words.saved.running
        : words.saved.stopped,
  };
}

/**
 * Shows `message` once the address is no longer `from`, as on Leave. After
 * TOAST_WAIT_MS it shows wherever it is.
 */
export function showToastAfterLeaving(message: string, from: string): void {
  if (typeof window === "undefined") return;
  // Frames as well as time: a test clock can hold Date.now() still.
  const started = performance.now();
  let frames = 0;
  const check = () => {
    frames += 1;
    const left = window.location.pathname !== from;
    const waited =
      performance.now() - started >= TOAST_WAIT_MS ||
      frames >= TOAST_WAIT_MS / 16;
    if (left || waited) {
      // One more frame, so the new screen has painted its bars.
      requestAnimationFrame(() => {
        showToast(message);
      });
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}
