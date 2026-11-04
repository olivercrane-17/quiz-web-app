"use client";

/**
 * The on-screen keyboard, tracked through the VisualViewport API (PRD
 * §3.1.4, DESIGN §10.3). Typing on a phone is the format's main risk, so
 * while the guess field has focus and a keyboard covers part of the screen,
 * the Mystery switches to its compact layout: older clues on one line,
 * Next clue beside the field, and a suggestion list of whole rows that end
 * above the keyboard.
 *
 * A keyboard counts as open when the visual viewport is more than 150 px
 * shorter than the tallest layout height seen at this width, which covers
 * browsers that only shrink the visual viewport (the default) and those
 * that resize the layout too (`interactive-widget=resizes-content`).
 * Pinch-zoom is scaled out, so zooming in is never mistaken for a keyboard.
 *
 * `keepInView` scrolls the least distance that keeps a block (the field
 * and the rows under it, or the Encore's field and Lock in) above the
 * keyboard, and the top of what should be read with it (the current clue)
 * below the top edge, which is the visual viewport's top or the bottom of
 * a sticky header pinned there. The block wins when both can't fit.
 * `keepBetween` is the same step against any bottom edge, such as the
 * visual viewport's own (`viewportBottom`) when no keyboard is up: zoom,
 * a short window, or a keyboard the page can't see (R1-11). There the
 * caller can let the read wins instead, for a block that may wait below.
 */
import { useEffect, useState } from "react";

export const KEYBOARD_MIN_PX = 150;
/** The gap kept between what we keep in view and the edges it must clear. */
const EDGE_GAP_PX = 8;

export interface KeyboardState {
  open: boolean;
  /** The visual viewport's bottom edge in layout-viewport coordinates (what getBoundingClientRect uses). */
  bottom: number;
}

const CLOSED: KeyboardState = { open: false, bottom: 0 };

/** Reads the state from a visual viewport, given the tallest layout height seen. */
export function keyboardStateOf(
  viewport: Pick<VisualViewport, "height" | "offsetTop" | "scale">,
  layoutHeight: number,
): KeyboardState {
  const covered = layoutHeight - viewport.height * viewport.scale;
  return covered > KEYBOARD_MIN_PX
    ? { open: true, bottom: viewport.offsetTop + viewport.height }
    : CLOSED;
}

/** The keyboard's state while `active` (the guess field has focus); closed otherwise. */
export function useOnScreenKeyboard(active: boolean): KeyboardState {
  const [state, setState] = useState<KeyboardState>(CLOSED);
  useEffect(() => {
    const viewport =
      typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || viewport === undefined || viewport === null) return;
    let width = window.innerWidth;
    let tallest = Math.max(
      window.innerHeight,
      viewport.height * viewport.scale,
    );
    const update = () => {
      if (window.innerWidth !== width) {
        // A rotation starts over.
        width = window.innerWidth;
        tallest = window.innerHeight;
      }
      tallest = Math.max(tallest, window.innerHeight);
      const next = keyboardStateOf(viewport, tallest);
      setState((prev) =>
        prev.open === next.open && prev.bottom === next.bottom ? prev : next,
      );
    };
    const frame = window.requestAnimationFrame(update);
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [active]);
  return active ? state : CLOSED;
}

/**
 * The highest point content can show at, in layout coordinates: the visual
 * viewport's top, or the bottom of a sticky or fixed header pinned there.
 */
export function topEdge(): number {
  let top = window.visualViewport?.offsetTop ?? 0;
  for (const header of document.querySelectorAll("header")) {
    const { position } = window.getComputedStyle(header);
    if (position !== "sticky" && position !== "fixed") continue;
    const rect = header.getBoundingClientRect();
    if (rect.height > 0 && rect.top <= top + 1 && rect.bottom > top) {
      top = rect.bottom;
    }
  }
  return top;
}

/** The root font size in px, for layout figures given in rem. */
export function remPx(): number {
  const size = Number.parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/**
 * The visual viewport's bottom edge in layout coordinates: what a keyboard,
 * a pinch zoom or a short window leaves. The layout viewport's without the
 * API.
 */
export function viewportBottom(): number {
  const viewport = window.visualViewport;
  return viewport === null || viewport === undefined
    ? window.innerHeight
    : viewport.offsetTop + viewport.height;
}

/**
 * Scrolls the least distance that puts `blockBottom` (layout coordinates)
 * above `bottomEdge` and keeps `readTop` below the top edge. When both
 * can't fit, `wins` decides: the block (the default: what the player is
 * about to use), or the read, which then stays in view while the block
 * comes as close as it can. Returns the distance scrolled.
 */
export function keepBetween(
  bottomEdge: number,
  blockBottom: number,
  readTop: number,
  wins: "block" | "read" = "block",
): number {
  const need = blockBottom - (bottomEdge - EDGE_GAP_PX);
  const slack = readTop - (topEdge() + EDGE_GAP_PX);
  let delta = 0;
  if (wins === "block") {
    if (need > 0) delta = need;
    else if (slack < 0) delta = Math.max(slack, need);
  } else if (slack < 0) {
    delta = slack;
  } else if (need > 0) {
    delta = Math.min(need, slack);
  }
  if (Math.abs(delta) < 1) return 0;
  window.scrollBy({ top: delta, behavior: "instant" });
  return delta;
}

/**
 * Scrolls the least distance that puts `blockBottom` (layout coordinates)
 * above the keyboard and keeps `readTop` below the top edge; when both
 * can't fit, the block wins. Returns the distance scrolled.
 */
export function keepInView(
  keyboard: KeyboardState,
  blockBottom: number,
  readTop: number,
): number {
  if (!keyboard.open) return 0;
  return keepBetween(keyboard.bottom, blockBottom, readTop);
}
