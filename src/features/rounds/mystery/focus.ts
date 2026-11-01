/**
 * Focus targets and key handling the Mystery and Encore rounds share.
 *
 * - `focusTargetProps` marks the element where one of the run machine's
 *   focus commands lands (ARCHITECTURE §4.5: `round_heading`,
 *   `clue_heading`, `reveal_heading`). The screen that runs the round finds
 *   it by attribute. DLY-1's round area queries `data-qz-focus`, and this
 *   lane named it `data-focus-target`, so both are set until the merge
 *   settles on one.
 * - `continueOnEnter` makes Enter activate Continue on a reveal (PRD
 *   §3.0.3), unless the key lands on a control that has its own Enter.
 * - `keepFieldFocus` cancels the pointer-down blur, so a press on a button
 *   leaves focus (and the on-screen keyboard) in the field, and the layout
 *   that depends on the keyboard doesn't shift between press and click.
 */
import type { KeyboardEvent, MouseEvent } from "react";

export type FocusTarget = "round_heading" | "clue_heading" | "reveal_heading";

export function focusTargetProps(target: FocusTarget | null): {
  "data-qz-focus"?: FocusTarget;
  "data-focus-target"?: FocusTarget;
} {
  return target === null
    ? {}
    : { "data-qz-focus": target, "data-focus-target": target };
}

/** What has its own Enter: links, buttons and fields. */
const OWNS_ENTER =
  'a[href], button, input, select, textarea, [role="button"], [role="link"], [contenteditable="true"]';

export function continueOnEnter(onContinue: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    // A held Enter repeats: the press that answered never skips the reveal.
    if (event.repeat || event.nativeEvent.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest(OWNS_ENTER) !== null) {
      return;
    }
    event.preventDefault();
    onContinue();
  };
}

export const keepFieldFocus = (event: MouseEvent) => {
  event.preventDefault();
};

/**
 * For a container's `onMouseDown`: keeps focus where it is when a button or
 * a suggestion row inside it is pressed. A press anywhere else still blurs
 * the field, so tapping the clue closes the keyboard as usual.
 */
export function keepFocusOnControls(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest('button, [role="option"]') !== null
  ) {
    event.preventDefault();
  }
}
