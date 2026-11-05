/**
 * The app's one 3 px ring on an element the app focuses itself, such as a
 * new question's stem or the results' score, whenever the player got there
 * by keyboard (DESIGN §11, R1-34).
 *
 * Chromium's `:focus-visible` matches a script's focus move that follows a
 * key press. Firefox matches it only when the element that had focus before
 * matched it, so once a click has moved focus (Quick play, say), no number
 * of key presses brings the ring back to a heading the app focuses. This
 * keeps the kind of the player's last input, and `focusWithRing` marks the
 * element with `data-focus-ring`, which globals.css draws exactly like
 * `:focus-visible`, until it loses focus.
 */

/** The ring's marker; globals.css draws `[data-focus-ring]:focus`. */
export const FOCUS_RING_ATTRIBUTE = "data-focus-ring";

let keyboard = false;
let watching = false;

function watchInput(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener(
    "keydown",
    (event) => {
      // A shortcut held with a modifier isn't keyboard navigation.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      keyboard = true;
    },
    true,
  );
  window.addEventListener(
    "pointerdown",
    () => {
      keyboard = false;
    },
    true,
  );
}

// From the moment a screen that moves focus loads, so the key press that
// leads to its first focus move is already counted.
watchInput();

/** Whether the player's last input was a key press (false before any input). */
export function lastInputWasKeyboard(): boolean {
  return keyboard;
}

/**
 * Focuses `element`, marked to show the ring when the last input was a key
 * press. The mark leaves with the focus.
 */
export function focusWithRing(
  element: HTMLElement | null,
  options?: FocusOptions,
): void {
  if (element === null) return;
  watchInput();
  if (keyboard) {
    element.setAttribute(FOCUS_RING_ATTRIBUTE, "");
    element.addEventListener(
      "blur",
      () => {
        element.removeAttribute(FOCUS_RING_ATTRIBUTE);
      },
      { once: true },
    );
  } else {
    element.removeAttribute(FOCUS_RING_ATTRIBUTE);
  }
  element.focus(options);
}
