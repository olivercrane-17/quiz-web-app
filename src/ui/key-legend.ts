"use client";

/**
 * Whether a key legend should show (decision D32; RITE round 4, R4-03):
 * once a key has been pressed, or on a device with a fine pointer that can
 * hover, where a keyboard is likely. Never on a touch-only phone, where
 * "Keys A to D answer at once." named keys the player doesn't have.
 *
 * - **A key press** counts from anywhere on the page and for as long as
 *   the page lives, so a legend that showed for one question shows for the
 *   rest of the run. A shortcut held with Ctrl, Alt or the command key
 *   isn't one, and neither is typing in a text field: a phone's on-screen
 *   keyboard sends key events too, and it answers nothing.
 * - **The pointer** is the device's primary one (`hover: hover` and
 *   `pointer: fine`): a mouse or a trackpad. A tablet that gains one
 *   mid-run shows the legend from then on.
 *
 * The server and the first client render say no, so the markup matches;
 * a screen holds the legend's line either way, so nothing moves when the
 * words arrive (decisions memo §25).
 */
import { useSyncExternalStore } from "react";

/** A device whose primary pointer is a mouse or a trackpad. */
export const KEYBOARD_LIKELY_QUERY = "(hover: hover) and (pointer: fine)";

let keyPressed = false;
let watching = false;
const listeners = new Set<() => void>();

function likely(): MediaQueryList | null {
  return typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia(KEYBOARD_LIKELY_QUERY);
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches("input, textarea, select, [role=combobox]"))
  );
}

function onKeyDown(event: KeyboardEvent): void {
  if (
    keyPressed ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    // An on-screen keyboard's composition, wherever it lands.
    event.isComposing ||
    event.key === "Unidentified" ||
    typing(event.target)
  ) {
    return;
  }
  keyPressed = true;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  if (!watching) {
    watching = true;
    window.addEventListener("keydown", onKeyDown, true);
  }
  listeners.add(listener);
  const media = likely();
  media?.addEventListener?.("change", listener);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener?.("change", listener);
  };
}

/** True once a key legend has a reader: a key was pressed, or a keyboard is likely. */
export function keyLegendShown(): boolean {
  return keyPressed || likely()?.matches === true;
}

/** `keyLegendShown`, kept current; false on the server and until hydration. */
export function useKeyLegend(): boolean {
  return useSyncExternalStore(subscribe, keyLegendShown, () => false);
}

/** For tests: as on a fresh page, before any key. */
export function forgetKeyPresses(): void {
  keyPressed = false;
}
