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
 */
import { useEffect, useState } from "react";

export const KEYBOARD_MIN_PX = 150;

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
