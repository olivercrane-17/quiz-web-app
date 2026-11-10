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
 *
 * The other way round, Chromium also matches `:focus-visible` on a script's
 * focus move when the page has had no input at all, so a phone that loads
 * straight into a question drew the frame around its options (RITE round
 * 5, R5-01 and R5-11; decision D36: a touch load shows no group focus
 * frame). When the last input was a touch, or there has been none on a
 * device whose primary pointer is no mouse, `focusWithRing` marks the
 * element with `data-focus-quiet` instead, and ui.css draws no ring on it.
 * The first key press takes that mark away, so a keyboard that joins in
 * finds its ring.
 */

/** The ring's marker; globals.css draws `[data-focus-ring]:focus`. */
export const FOCUS_RING_ATTRIBUTE = "data-focus-ring";

/** The mark of a focus move no keyboard is there to see; ui.css hides its ring. */
export const FOCUS_QUIET_ATTRIBUTE = "data-focus-quiet";

let keyboard = false;
/** The last input was a finger on the screen. */
let touch = false;
/** The element that wears the quiet mark, if one does. */
let quieted: HTMLElement | null = null;
let watching = false;

function unquiet(): void {
  quieted?.removeAttribute(FOCUS_QUIET_ATTRIBUTE);
  quieted = null;
}

/** No keyboard is in sight: a touch came last, or nothing has, on a touch device. */
function touchOnly(): boolean {
  if (keyboard) return false;
  if (touch) return true;
  return (
    typeof window.matchMedia === "function" &&
    // The primary pointer is a finger: no mouse, no trackpad.
    window.matchMedia("(pointer: coarse)").matches
  );
}

function watchInput(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener(
    "keydown",
    (event) => {
      // A shortcut held with a modifier isn't keyboard navigation.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      keyboard = true;
      touch = false;
      unquiet();
    },
    true,
  );
  window.addEventListener(
    "pointerdown",
    (event) => {
      keyboard = false;
      touch = (event as PointerEvent).pointerType === "touch";
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
 * press, or to show none on a touch device with no keyboard in sight. The
 * mark leaves with the focus.
 */
export function focusWithRing(
  element: HTMLElement | null,
  options?: FocusOptions,
): void {
  if (element === null) return;
  watchInput();
  unquiet();
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
    if (touchOnly()) {
      quieted = element;
      element.setAttribute(FOCUS_QUIET_ATTRIBUTE, "");
      element.addEventListener(
        "blur",
        () => {
          element.removeAttribute(FOCUS_QUIET_ATTRIBUTE);
          if (quieted === element) quieted = null;
        },
        { once: true },
      );
    }
  }
  element.focus(options);
}
