/**
 * Toasts (DESIGN §6.9): an ink pill that confirms something happened
 * ("Copied. Paste it into your group chat.", "Saved", "Report sent"). One
 * at a time, 4 s, tap to dismiss, 16 px above the tab bar or the dock. Its
 * text also goes to the polite status region, which is what screen readers
 * hear; the pill itself is decorative for them.
 *
 * It never sits on a control (RITE round 3, R3-08). At 200% text Today's
 * Continue reached the bottom of the screen, under "Saved. The stopwatch
 * keeps running." for its 4 s while the clock ran, and the copy toast sat
 * on Share. So while it shows, the toast checks the controls on screen:
 * if one is under its place above the bar and none is under the top place
 * (16 px below the sticky header), it moves to the top, and back once the
 * bottom is clear and the top isn't. When both places cover a control (at
 * 320 px and 200% text, Share sat between them), it sinks toward the bar,
 * down to 4 px above it, as far as it must to clear every control. When
 * even that leaves a control under it, it never covers the page's primary
 * action (at 390 x 844 and 200% text, scrolled about 480 px, Today's
 * Continue sat under the bottom place and a lesser control under the top
 * one, and it stayed on Continue): it takes the place that covers no
 * primary button, else sinks clear of them, else sits in the first gap
 * between its two places that clears them. It checks again when the page
 * changes under it (Today's card arrives after the address does), scrolls
 * or resizes.
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
 * from an event handler or an effect, never during render. Like the pill,
 * its words outlive the page that showed it ("Saved" on Leave is heard on
 * Today), and they leave the status region with the pill.
 */
import { announce, withdrawAnnouncement } from "./announce";
import { UI_COPY } from "./copy";
import { onRouteChange } from "./route-change";
import { firstShown, isShown } from "./shown";

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
/** The closest a toast sinks toward its bar when both places cover a control. */
const MIN_GAP_PX = 4;
/** The usual sticky header, before the shell has measured the real one. */
const TOP_BAR_PX = 56;
/** What a toast must not cover. */
const CONTROLS =
  'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
/** The page's primary actions, which it never covers while there is room: a primary button, Today's ticket. */
const PRIMARY = ".kn-btn-primary, .kn-btn-ticket";
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

/**
 * Where the toast sits at the bottom: 16 px above the first anchor on
 * screen, else above the safe area; with the anchor's top, when there is
 * one on screen, for a toast that must sink toward it.
 */
function bottomOffset(): { css: string; anchorTop: number | null } {
  const anchor = firstShown<HTMLElement>(TOAST_ANCHOR);
  if (anchor === null) {
    return {
      css: `calc(${GAP_PX}px + env(safe-area-inset-bottom))`,
      anchorTop: null,
    };
  }
  const top = anchor.getBoundingClientRect().top;
  const onScreen = top < window.innerHeight;
  return {
    css: `${Math.max(GAP_PX, window.innerHeight - top + GAP_PX)}px`,
    anchorTop: onScreen ? top : null,
  };
}

/** Where it sits at the top: 16 px under the sticky header the shell measured (`--kn-inset-top`). */
function topOffset(): number {
  const measured = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--kn-inset-top",
    ),
  );
  return (Number.isFinite(measured) ? measured : TOP_BAR_PX) + GAP_PX;
}

export type ToastPlace = "bottom" | "top";

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

/** The boxes of the controls on screen, apart from the toast's own: all of them, and the primary actions among them. */
function controlBoxes(toast: HTMLElement): { all: Box[]; primary: Box[] } {
  const all: Box[] = [];
  const primary: Box[] = [];
  for (const control of document.querySelectorAll(CONTROLS)) {
    if (toast.contains(control) || !isShown(control)) continue;
    const box = control.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      all.push(box);
      if (control.matches(PRIMARY)) primary.push(box);
    }
  }
  return { all, primary };
}

/**
 * The place for a toast `height` px tall and `width` px wide, centred, given
 * the controls on screen: it stays where it is unless a control is under it
 * and the other place is clear (R3-08). When both places cover a control
 * and `sink` gives the bar's top, it tries the bottom place nearer the bar,
 * a pixel at a time from `sink.gap` down to `sink.minGap`, and takes the
 * first that clears every control. `bottom` is the offset from the
 * viewport's bottom to use: `spots.bottom` unless it sank.
 *
 * When a control is under it wherever it goes, it keeps off `primary`, the
 * page's primary actions: it takes the place that covers none (its own
 * first), else sinks as above until it clears them, else takes the first
 * gap below the top place that does, returned as `top`.
 */
export function choosePlace(
  current: ToastPlace,
  size: { width: number; height: number },
  spots: { bottom: number; top: number },
  controls: readonly Box[],
  viewport: { width: number; height: number },
  sink?: { anchorTop: number; gap: number; minGap: number },
  primary: readonly Box[] = [],
): { place: ToastPlace; bottom: number; top?: number } {
  const left = (viewport.width - size.width) / 2;
  const right = left + size.width;
  const boxes: Record<ToastPlace, Box> = {
    bottom: {
      left,
      right,
      bottom: viewport.height - spots.bottom,
      top: viewport.height - spots.bottom - size.height,
    },
    top: { left, right, top: spots.top, bottom: spots.top + size.height },
  };
  const other: ToastPlace = current === "bottom" ? "top" : "bottom";
  // First clear of every control; then, where that can't be, of the
  // primary actions alone.
  for (const avoid of [controls, primary]) {
    const covers = (box: Box) =>
      avoid.some((control) => overlaps(box, control));
    if (!covers(boxes[current]))
      return { place: current, bottom: spots.bottom };
    if (!covers(boxes[other])) return { place: other, bottom: spots.bottom };
    if (sink !== undefined) {
      for (let gap = sink.gap; gap >= sink.minGap; gap -= 1) {
        const bottom = viewport.height - sink.anchorTop + gap;
        const top = viewport.height - bottom - size.height;
        if (!covers({ left, right, top, bottom: top + size.height })) {
          return { place: "bottom", bottom };
        }
      }
    }
  }
  for (let top = spots.top; top < boxes.bottom.top; top += 1) {
    const gap = { left, right, top, bottom: top + size.height };
    if (!primary.some((control) => overlaps(gap, control))) {
      return { place: "top", bottom: spots.bottom, top };
    }
  }
  return { place: current, bottom: spots.bottom };
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
  element.dataset.place = "bottom";
  const place = () => {
    const { css: bottom, anchorTop } = bottomOffset();
    const top = topOffset();
    element.style.setProperty("--kn-toast-bottom", bottom);
    element.style.setProperty("--kn-toast-top", `${top}px`);
    if (!element.isConnected) return;
    const box = element.getBoundingClientRect();
    const bottomPx = Number.parseFloat(bottom);
    // The safe-area form starts with its 16 px; close enough to choose by.
    const spotBottom = Number.isFinite(bottomPx) ? bottomPx : GAP_PX;
    const controls = controlBoxes(element);
    const chosen = choosePlace(
      element.dataset.place === "top" ? "top" : "bottom",
      { width: box.width, height: box.height },
      { bottom: spotBottom, top },
      controls.all,
      { width: window.innerWidth, height: window.innerHeight },
      anchorTop === null
        ? undefined
        : { anchorTop, gap: GAP_PX, minGap: MIN_GAP_PX },
      controls.primary,
    );
    element.dataset.place = chosen.place;
    if (chosen.bottom !== spotBottom) {
      element.style.setProperty("--kn-toast-bottom", `${chosen.bottom}px`);
    }
    if (chosen.top !== undefined) {
      element.style.setProperty("--kn-toast-top", `${chosen.top}px`);
    }
  };
  place();
  // A toast that outlives its page rises above the next page's bar, not
  // the old page's dock (Share, then "Done for today").
  const stopRoute = onRouteChange(place);
  // The page may change under it: Today's Daily card, with Continue,
  // arrives after the address does. One check per frame at most.
  let frame = 0;
  const schedule = () => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };
  const observer =
    typeof MutationObserver === "function"
      ? new MutationObserver(schedule)
      : null;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  const stopFollowing = () => {
    stopRoute();
    observer?.disconnect();
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
  };
  if (icon !== "none") element.insertAdjacentHTML("afterbegin", iconSvg(icon));
  const text = document.createElement("span");
  text.textContent = message;
  element.append(text);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let gone = false;
  /** The toast's words in the status region, kept through a change of address. */
  let spoken: HTMLElement | null = null;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") dismiss();
  };
  const dismiss = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    stopFollowing();
    document.removeEventListener("keydown", onKeyDown);
    withdrawAnnouncement(spoken);
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
  // Now that it has a size, choose between the two places.
  place();
  observer?.observe(document.body, { childList: true, subtree: true });
  current = { element, dismiss };
  spoken = announce(
    action === undefined
      ? message
      : `${sentence(message)} ${UI_COPY.toast.actionAvailable(action.label)}`,
    "polite",
    { keepOnRouteChange: true },
  );
  return dismiss;
}
