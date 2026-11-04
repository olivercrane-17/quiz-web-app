/**
 * A greybox toast (DESIGN §6.9) for the Daily's "Saved" on Leave (RITE
 * round 1, R1-38): an ink pill 16 px above the tab bar, one at a time,
 * 4 s, tap to dismiss, its text mirrored into the polite status region,
 * which is what screen readers hear. DS-1 builds the design system's own
 * `showToast` in `src/ui/toast.ts` with the same signature; once it merges,
 * the Daily imports that one and this file goes (a FIX-DS follow-up).
 *
 * Leave navigates, so the toast waits until the address has changed and
 * the next screen is in place, then sits above that screen's tab bar.
 * Like DS-1's, it builds its own element at the end of `<body>`, outside
 * every route, so the route that called it can hide without taking the
 * toast along. Call it from an event handler or an effect.
 */
import { announce } from "@/ui/announce";
import { firstShown } from "@/ui/shown";

/** How long a toast stays (DESIGN §6.9). */
export const TOAST_MS = 4_000;
/** The longest a toast waits for the navigation that called it. */
export const TOAST_WAIT_MS = 2_000;

const GAP_PX = 16;
/** DS-1's anchor attribute first, then the phone's bottom tab bar. */
const ANCHORS = ["[data-toast-anchor]", 'nav[data-placement="bottom"]'];

let current: { element: HTMLElement; dismiss: () => void } | null = null;

function bottomOffset(): string {
  for (const selector of ANCHORS) {
    const anchor = firstShown<HTMLElement>(selector);
    if (anchor === null) continue;
    const top = anchor.getBoundingClientRect().top;
    if (top <= 0) continue;
    return `${Math.max(GAP_PX, window.innerHeight - top + GAP_PX)}px`;
  }
  return `calc(${GAP_PX}px + env(safe-area-inset-bottom))`;
}

/** Shows `message` as the only toast; returns a function that dismisses it early. */
export function showToast(message: string): () => void {
  if (typeof document === "undefined" || message.trim() === "") {
    return () => {};
  }
  current?.dismiss();

  const element = document.createElement("div");
  element.dataset.toast = "";
  // The status region speaks it; the pill would only say it twice.
  element.setAttribute("aria-hidden", "true");
  element.className =
    "fixed left-1/2 z-50 flex max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 py-3 text-base font-semibold text-background shadow-lg";
  element.style.bottom = bottomOffset();
  element.textContent = message;

  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    element.remove();
    if (current?.element === element) current = null;
  };
  element.addEventListener("click", dismiss);

  document.body.append(element);
  current = { element, dismiss };
  const timer = setTimeout(dismiss, TOAST_MS);
  announce(message);
  return dismiss;
}

/**
 * Shows `message` once the address is no longer `from`, as on Leave: the
 * new screen's bars are then in place to sit above, and its status region
 * is the one that hears it. After TOAST_WAIT_MS it shows wherever it is.
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
