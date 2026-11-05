/**
 * "Saved" on Leave (RITE round 1, R1-38; DESIGN §6.9), in the design
 * system's toast (`@/ui/toast`): one at a time, 4 s, tap to dismiss, its
 * words kept in the status region through the change of address.
 *
 * Leave navigates, and the toast sits 16 px above the bar it finds when it
 * is shown, so it waits until the address has changed and the next screen
 * is in place: then it rises above Today's tab bar rather than the Daily's
 * empty bottom edge. Call it from an event handler or an effect.
 */
import { showToast } from "@/ui/toast";

/** The longest a toast waits for the navigation that called it. */
export const TOAST_WAIT_MS = 2_000;

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
