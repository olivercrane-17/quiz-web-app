"use client";

/**
 * Whether a keyboard is in use (D32, RITE round 4, R4-03): a key legend
 * shows once a key has been pressed, or where the device has a fine pointer
 * that hovers (a mouse or a trackpad, so a keyboard is likely), and never
 * on a touch-only phone, where "Keys A to D choose" taught a second step
 * that a tap didn't have (R4-01).
 *
 * A key typed into a field doesn't count: an on-screen keyboard sends
 * keys too, and only ever into a field. Once a keyboard is in use it stays
 * so until the page goes: the legend never flips back mid-run.
 */
import { useSyncExternalStore } from "react";

let inUse = false;
let watching = false;
const listeners = new Set<() => void>();

function note(event: KeyboardEvent) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  ) {
    return;
  }
  inUse = true;
  window.removeEventListener("keydown", note, true);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (!watching) {
    // Once per page: the first round to ask starts the watch, and a key
    // pressed on any later screen still counts.
    watching = true;
    inUse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!inUse) window.addEventListener("keydown", note, true);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const current = () => inUse;
const onServer = () => false;

/** True once a keyboard is in use on this page (D32). */
export function useKeysInUse(): boolean {
  return useSyncExternalStore(subscribe, current, onServer);
}

/** For tests: forget the keyboard, as a fresh page would. */
export function resetKeysInUse(): void {
  window.removeEventListener("keydown", note, true);
  inUse = false;
  watching = false;
}
