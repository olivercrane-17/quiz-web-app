"use client";

/**
 * The pressed look of every tap target (PRD §3.0.3, DESIGN §6.1, §6.2): it
 * appears in the same frame as `pointerdown`, and the action itself waits
 * for `click`, so sliding off the control before letting go cancels it
 * (WCAG 2.5.2).
 *
 * Touch input captures the pointer to the element it started on, which
 * would keep the press alive after the finger slides away. Releasing that
 * implicit capture lets `pointerleave` end the press, and lets the browser
 * skip the click when the finger lifts somewhere else.
 */
import { useState, type PointerEvent } from "react";

export interface PressHandlers {
  onPointerDown(event: PointerEvent<HTMLElement>): void;
  onPointerUp(): void;
  onPointerCancel(): void;
  onPointerLeave(): void;
}

export function usePressed(
  enabled: boolean,
  onPressStart?: () => void,
): [pressed: boolean, handlers: PressHandlers] {
  const [pressed, setPressed] = useState(false);
  const release = () => {
    setPressed(false);
  };
  const handlers: PressHandlers = {
    onPointerDown(event) {
      // The primary button only: a right click or a pen's barrel button never presses.
      if (!enabled || event.button !== 0) return;
      const target = event.currentTarget;
      if (target.hasPointerCapture?.(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      setPressed(true);
      onPressStart?.();
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
  };
  // A control that stops being interactive mid-press (a verdict arrived) drops the look at once.
  return [pressed && enabled, handlers];
}
