/**
 * Toasts (DESIGN §6.9): an ink pill that confirms something happened
 * ("Copied. Paste it into your group chat.", "Saved", "Report sent"). One
 * at a time, 4 s (10 s with an Undo action), tap to dismiss, 16 px above
 * the tab bar or the dock, so it never covers a primary button. Its text
 * also goes to the polite status region, which is what screen readers hear;
 * the pill itself is decorative for them.
 *
 * Errors never use a toast: they sit next to what failed.
 *
 * It builds its own element at the end of `<body>` when called, so a screen
 * that never shows one pays nothing, and no provider is needed. Call it
 * from an event handler or an effect, never during render.
 */
import { announce } from "./announce";
import { firstShown } from "./shown";

export interface ToastOptions {
  /** An action inside the toast: "Undo" for the editor's delete. */
  action?: { label: string; onAction: () => void };
  /** How long it stays; 4 s, or 10 s with an action. */
  durationMs?: number;
}

/** Bars a toast rises above: the tab bar, the results dock. */
export const TOAST_ANCHOR = "[data-toast-anchor]";

const GAP_PX = 16;
const LEAVE_MS = 200;
const CHECK =
  '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M20 6 9 17l-5-5"/></svg>';

let current: { element: HTMLElement; dismiss: () => void } | null = null;

/** Where the toast sits: 16 px above the first anchor on screen, else above the safe area. */
function bottomOffset(): string {
  const anchor = firstShown<HTMLElement>(TOAST_ANCHOR);
  if (anchor === null) return `calc(${GAP_PX}px + env(safe-area-inset-bottom))`;
  const top = anchor.getBoundingClientRect().top;
  return `${Math.max(GAP_PX, window.innerHeight - top + GAP_PX)}px`;
}

/** Shows `message` as the only toast; returns a function that dismisses it early. */
export function showToast(
  message: string,
  options: ToastOptions = {},
): () => void {
  if (typeof document === "undefined" || message.trim() === "") {
    return () => {};
  }
  current?.dismiss();

  const element = document.createElement("div");
  element.className = "kn-toast";
  element.dataset.toast = "";
  // The status region speaks it; the pill would only repeat it, unless it
  // holds an action that keyboard and screen-reader users must reach.
  if (options.action === undefined) element.setAttribute("aria-hidden", "true");
  element.style.setProperty("--kn-toast-bottom", bottomOffset());
  element.insertAdjacentHTML("afterbegin", CHECK);
  const text = document.createElement("span");
  text.textContent = message;
  element.append(text);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    element.dataset.leaving = "";
    setTimeout(() => {
      element.remove();
    }, LEAVE_MS);
    if (current?.element === element) current = null;
  };

  if (options.action !== undefined) {
    const { label, onAction } = options.action;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onAction();
      dismiss();
    });
    element.append(button);
  }
  element.addEventListener("click", dismiss);

  const duration = options.durationMs ?? (options.action ? 10_000 : 4_000);
  const start = () => {
    clearTimeout(timer);
    timer = setTimeout(dismiss, duration);
  };
  // Hovering or focusing it holds it, so an Undo can always be reached.
  element.addEventListener("pointerenter", () => {
    clearTimeout(timer);
  });
  element.addEventListener("pointerleave", start);
  element.addEventListener("focusin", () => {
    clearTimeout(timer);
  });
  element.addEventListener("focusout", start);

  document.body.append(element);
  current = { element, dismiss };
  start();
  announce(message);
  return dismiss;
}
