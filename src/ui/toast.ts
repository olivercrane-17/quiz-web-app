/**
 * Toasts (DESIGN §6.9): an ink pill that confirms something happened
 * ("Copied. Paste it into your group chat.", "Saved", "Report sent"). One
 * at a time, 4 s, tap to dismiss, 16 px above the tab bar or the dock, so
 * it never covers a primary button. Its text also goes to the polite status
 * region, which is what screen readers hear; the pill itself is decorative
 * for them.
 *
 * A toast with an action (the editor's Undo) has no time limit, because a
 * keyboard or screen-reader user reaches it last, at the end of the page
 * (WCAG 2.2.1). It stays until its action runs, it is tapped, Escape is
 * pressed or the next toast replaces it, and the status region says the
 * action is there: "Quiz deleted. Undo is available." This replaces
 * DESIGN §6.9's 10 s for Undo toasts.
 *
 * The icon on the left is a check, which confirms, unless the caller asks
 * for `offline` (Lucide's wifi-off) for something queued until the
 * connection is back ("We'll send this when you're back online."), or for
 * none.
 *
 * Errors never use a toast: they sit next to what failed.
 *
 * It builds its own element at the end of `<body>` when called, so a screen
 * that never shows one pays nothing, and no provider is needed. Call it
 * from an event handler or an effect, never during render.
 */
import { announce } from "./announce";
import { UI_COPY } from "./copy";
import { firstShown } from "./shown";

export type ToastIcon = "check" | "offline" | "none";

export interface ToastOptions {
  /** An action inside the toast: "Undo" for the editor's delete. Such a toast stays until it is used or dismissed. */
  action?: { label: string; onAction: () => void };
  /** How long a toast without an action stays; 4 s by default. */
  durationMs?: number;
  /** `check` (the default) for a confirmation; `offline` for something queued until the connection is back. */
  icon?: ToastIcon;
}

/** Bars a toast rises above: the tab bar, the results dock. */
export const TOAST_ANCHOR = "[data-toast-anchor]";

const GAP_PX = 16;
const LEAVE_MS = 200;
const DURATION_MS = 4_000;

/** Lucide's paths (./icons.tsx draws the same ones), at 18 px with a 2.3 stroke (DESIGN §5). */
const ICON_PATHS: Record<Exclude<ToastIcon, "none">, string> = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  offline:
    '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
};

function iconSvg(icon: Exclude<ToastIcon, "none">): string {
  return `<svg aria-hidden="true" focusable="false" data-icon="${icon}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${ICON_PATHS[icon]}</svg>`;
}

/** A pause before the words that follow, unless the message already ends a sentence. */
function sentence(message: string): string {
  const trimmed = message.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

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

  const { action, icon = "check" } = options;
  const element = document.createElement("div");
  element.className = "kn-toast";
  element.dataset.toast = "";
  // The status region speaks it; the pill would only repeat it, unless it
  // holds an action that keyboard and screen-reader users must reach.
  if (action === undefined) element.setAttribute("aria-hidden", "true");
  element.style.setProperty("--kn-toast-bottom", bottomOffset());
  if (icon !== "none") element.insertAdjacentHTML("afterbegin", iconSvg(icon));
  const text = document.createElement("span");
  text.textContent = message;
  element.append(text);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let gone = false;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") dismiss();
  };
  const dismiss = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    document.removeEventListener("keydown", onKeyDown);
    element.dataset.leaving = "";
    setTimeout(() => {
      element.remove();
    }, LEAVE_MS);
    if (current?.element === element) current = null;
  };
  element.addEventListener("click", dismiss);

  if (action === undefined) {
    const duration = options.durationMs ?? DURATION_MS;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(dismiss, duration);
    };
    // Hovering or focusing it holds it while it is being read.
    element.addEventListener("pointerenter", () => {
      clearTimeout(timer);
    });
    element.addEventListener("pointerleave", start);
    element.addEventListener("focusin", () => {
      clearTimeout(timer);
    });
    element.addEventListener("focusout", start);
    start();
  } else {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      action.onAction();
      dismiss();
    });
    element.append(button);
    document.addEventListener("keydown", onKeyDown);
  }

  document.body.append(element);
  current = { element, dismiss };
  announce(
    action === undefined
      ? message
      : `${sentence(message)} ${UI_COPY.toast.actionAvailable(action.label)}`,
  );
  return dismiss;
}
