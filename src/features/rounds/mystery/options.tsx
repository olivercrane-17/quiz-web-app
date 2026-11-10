"use client";

/**
 * The four options of a Mystery's last clue (PRD §3.1.4, §3.0.3; DESIGN
 * §6.2, §12.2): answer buttons A to D on CORE-0b's AnswerButton, and under
 * them the Lock in button. An option the player already guessed shows
 * disabled with "Already guessed"; the picked option holds its locked look
 * while the server judges it, and the others wait, disabled. Their line
 * says what the pick is worth knowing: on clue 4, "Last clue. Pick one of
 * four. One pick: a wrong one scores 0." (D24, R2-16); with options from
 * clue 3, a later clue is still to come, so "Pick one of four".
 *
 * One way to lock in, for every input (D31, RITE round 4, R4-01; it
 * reverses §22's "commits on release by touch" and D20's same key twice).
 * The pick is one shot and a miss scores 0, so it takes two steps, as the
 * Encore's does:
 *
 * - **Choose.** A tap, a click, Space, Enter on an option that isn't
 *   chosen, or its letter chooses an option: it is marked (the pressed
 *   look, an inked badge, `aria-pressed="true"`) and "Cobalt chosen." is
 *   announced. Nothing is sent. Choosing another option moves the mark;
 *   Tab moves focus and leaves the mark where it is; the same letter, or
 *   the same tap, again changes nothing.
 * - **Lock in.** The "Lock in Cobalt" button under the options, or Enter on
 *   the chosen option, sends the one pick. The button is always there, in
 *   a bar docked at the bottom of the screen while the options are in
 *   view, so it sits under the thumb and nothing moves when it wakes: it
 *   reads "Lock in" and is disabled (still focusable, so it can be found)
 *   until an option is chosen. Its label keeps to one line, so the bar is
 *   as tall before a choice as after, at any text size. The bar sticks
 *   inside the box that holds the options, so it never rises over the lead
 *   line or the legend. A second tap on the spot that chose, within
 *   `DOUBLE_TAP_MS`, never locks in, wherever the bar is by then. The round
 *   sends one pick only (`MysteryRound`), and a held key never repeats its
 *   way into one.
 *
 * The line above the options says what is true for the device (D32,
 * R4-03): "Tap one, then Lock in." until a keyboard is in use (`keys`: a
 * key was pressed, or the pointer is a mouse, and no touch has come
 * since), then "Keys A to D choose. Enter on your choice locks in." (D38,
 * R5-03). The line holds room for the other wording (drawn by CSS, so it
 * is in the page's text once), and nothing moves when it changes. It is
 * the group's description too, said once.
 *
 * Keys (D20, amending D6; R2-02; D28, R3-05). The group listens, never the
 * round: letters and digits act only while focus is in the options group
 * (on the group itself or on an option), so a key pressed on a heading,
 * the page or the Lock in button does nothing (WCAG 2.1.4's "active only
 * on focus", until Settings has the switch). As the options arrive, and
 * when a reload or Continue brings the round back with them showing
 * (R4-11), focus goes to the group (D28), which is labelled by the clue's
 * heading and described by its lead line and the legend, so a screen
 * reader hears the new clue first and A then Enter works with no Tab.
 *
 * - Letters A to D match the badges; digits 1 to 4 choose only when no
 *   option reads as a number, so "4" can never mean option D when four is
 *   an answer (D6, R1-13). Each option names its keys in
 *   `aria-keyshortcuts` ("C 3", or "C"), and the badge is the one hint
 *   drawn on it. A key moves focus to the option it chooses.
 * - Typing among the options is not a choice (D20's typing guard, R2-02
 *   and R3-05 after review). Any printable key that names no option
 *   clears the mark and what was said of it, and opens a short typing
 *   window (`TYPING_MS`, renewed by each key typed in it, and opened too
 *   when a key moves the mark from one option to another). Inside it an
 *   option key after a typed one only moves focus, and Enter acts only on
 *   the chosen option, so A then B then Enter (a change of mind) still
 *   locks B.
 * - Three keys are a word at any ordinary pace (D31, R4-11, integration
 *   9, and D38 after RITE round 5, R5-04: a typist at 900 ms a key, or one
 *   who stops for a second before the last letter, is still typing). The
 *   third letter or digit in a run, a doubled letter counted twice, makes
 *   a typed word whatever its letters ("Abba", "Add" and "cab" are made
 *   of option keys alone). A run starts when focus comes to the options,
 *   and again with any key that follows a pause of `WORD_PAUSE_MS` (1.5 s)
 *   or more, so three slow, deliberate changes of mind (A, a pause, B, a
 *   pause, D) still choose. Once a word is typed, the mark clears, focus
 *   goes back to the options group, so no option wears a ring that reads
 *   as a choice, an option key does nothing, and Enter and Space do
 *   nothing, however long the pause before them: "Cartographer", "Abba" or
 *   "Arvenna" then Enter sends nothing. That holds until Escape, or until
 *   Tab or a pointer reaches an option, and the legend says so while it
 *   does: "Typing chooses nothing. Press Esc, then A to D." (spoken once,
 *   too). Two keys are never a word: A, a pause, B,
 *   Enter locks B.
 * - Space inside the typing window, or straight after a key chose ("B
 *   Smith"), is a typed name's space and does nothing. Otherwise it
 *   chooses the focused option, and never locks in.
 * - On the group itself, before any option has focus, a key chooses as it
 *   does from an option (focus moves to it), Space opens the typing window
 *   (a first Space still scrolls the page; one inside a typed name does
 *   nothing), and Enter does nothing.
 * - Escape clears the mark.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";

import type { OptionView } from "@/engine/types";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { announce, withdrawAnnouncement } from "@/ui/announce";
import { AnswerButton, type AnswerState } from "@/ui/answer-button";
import { cx } from "@/ui/cx";

import { MYSTERY_COPY } from "./copy";
import { focusTargetProps, type FocusTarget } from "./focus";
import { LockInBar } from "./lock-in";
import { TONE } from "./tones";

const LETTER_KEYS = ["a", "b", "c", "d"] as const;
const DIGIT_KEYS = ["1", "2", "3", "4"] as const;

/**
 * How long after a key typed among the options a further key still counts
 * as typing (a name, not a choice): long enough to span the gap between
 * letters, short enough that a deliberate second press after a pause locks
 * in.
 */
export const TYPING_MS = 800;

/**
 * How many letters or digits in one run (since focus came to the options
 * by Tab, a pointer, the options arriving or Escape, or since a pause of
 * `WORD_PAUSE_MS`) make a typed word whatever their letters (D31, R4-11):
 * two can be a change of mind (A, then B) or the same letter again, three
 * are "cab" or "Add".
 */
const WORD_KEYS = 3;

/**
 * A key that comes this long after the one before starts the count of a
 * word's keys again (D38, R5-04): nobody types a word at 1.5 s a letter,
 * and a player who weighs each option does press that slowly.
 */
export const WORD_PAUSE_MS = 1500;

/**
 * How long after a tap chose an option a tap on the same spot is still the
 * second half of a double tap, and how near it has to land to be one.
 */
export const DOUBLE_TAP_MS = 500;
const DOUBLE_TAP_PX = 24;

/**
 * The chosen option's mark, beside the pressed look AnswerButton draws for
 * `pressed`: its badge turns ink with the letter in the page's colour, so
 * the mark is a fill and a shape, never a hue alone. Forced colours paint
 * the badge in the system highlight.
 */
const CHOSEN_BADGE = cx(
  "[&_.kn-answer-badge]:bg-[color:var(--kn-ink,var(--foreground))] [&_.kn-answer-badge]:text-[color:var(--kn-surface,var(--background))]",
  "forced-colors:[&_.kn-answer-badge]:bg-[color:Highlight] forced-colors:[&_.kn-answer-badge]:text-[color:HighlightText] forced-colors:[&_.kn-answer-badge]:forced-color-adjust-none",
);

/**
 * Where a pointer's click landed, or null for a click with no place: a
 * keyboard's or a screen reader's (`detail` 0, or the page's own corner,
 * where no option and no button is).
 */
function placeOf(event: MouseEvent): { x: number; y: number } | null {
  if (event.detail === 0) return null;
  if (event.clientX === 0 && event.clientY === 0) return null;
  return { x: event.clientX, y: event.clientY };
}

/** What the line above the options can say (D32, and a typed word's hint). */
const LEGEND_KINDS = ["tap", "keys", "typed"] as const;
type LegendKind = (typeof LEGEND_KINDS)[number];
const LEGENDS: Readonly<Record<LegendKind, string>> = {
  tap: MYSTERY_COPY.options.tapLegend,
  keys: MYSTERY_COPY.options.legend,
  typed: MYSTERY_COPY.options.typedLegend,
};

/** When a key came down, on the clock the typing window is measured by. */
const keyTime = () => performance.now();

/** An option that reads as a number: its label starts with a digit ("15", "1,250 km", "1917"). */
function readsAsNumber(label: string): boolean {
  return /^\s*\p{Nd}/u.test(label);
}

/** Whether digits pick among these options (D6): only when none reads as a number. */
export function digitsPick(options: readonly OptionView[]): boolean {
  return !options.some((option) => readsAsNumber(option.label));
}

/**
 * The keys that pick the option at `position`, as `aria-keyshortcuts`
 * lists them: "A 1", or "A" where digits don't pick (D6).
 */
export function keysFor(position: number, digits: boolean): string | null {
  const letter = LETTER_KEYS[position];
  if (letter === undefined) return null;
  const digit = DIGIT_KEYS[position];
  return digits && digit !== undefined
    ? `${letter.toUpperCase()} ${digit}`
    : letter.toUpperCase();
}

/**
 * The option a key picks (D6), or null: A to D (either case) by position,
 * and 1 to 4 by position only while `digitsPick`. Already-guessed options
 * pick nothing.
 */
export function optionForKey(
  key: string,
  options: readonly OptionView[],
): OptionView | null {
  const option = optionNamedBy(key, options);
  return option === undefined || option.alreadyGuessed ? null : option;
}

/** The option a key names by position, already guessed or not (D6). */
function optionNamedBy(
  key: string,
  options: readonly OptionView[],
): OptionView | undefined {
  let position = LETTER_KEYS.indexOf(
    key.toLowerCase() as (typeof LETTER_KEYS)[number],
  );
  if (position < 0 && digitsPick(options)) {
    position = DIGIT_KEYS.indexOf(key as (typeof DIGIT_KEYS)[number]);
  }
  return position < 0 ? undefined : options[position];
}

export interface MysteryOptionsProps {
  options: readonly OptionView[];
  /** Clue 4: the one pick is the last chance, and its line says so (D24). */
  last: boolean;
  /** The option being judged, if any. */
  picked: number | null;
  busy: boolean;
  disabled: boolean;
  shortcuts: boolean;
  /** A keyboard is in use (D32, `useKeyLegend`): the legend names the keys. */
  keys: boolean;
  sound: boolean;
  haptics: boolean;
  /**
   * The id of the clue heading the group is labelled by (D28): focus lands
   * on the group as the options arrive, and the clue is read first. Without
   * one the group is labelled by its lead line.
   */
  labelledBy?: string;
  /** The group, which the round focuses as the options arrive (D28). */
  groupRef?: Ref<HTMLDivElement>;
  /**
   * The focus commands that land on the group: the clue's, and in a round
   * the round's own too, for when a reload or Continue brings it back with
   * the options showing (R4-11).
   */
  focusTarget?: FocusTarget | readonly FocusTarget[];
  /** Runs once the options are drawn: the round focuses and shows them. */
  onReady?: () => void;
  onPick(index: number): void;
}

function stateOf(
  option: OptionView,
  props: Pick<MysteryOptionsProps, "picked" | "busy" | "disabled">,
): AnswerState {
  if (option.alreadyGuessed) return "already-guessed";
  if (props.busy) return props.picked === option.index ? "locked" : "disabled";
  return props.disabled ? "disabled" : "idle";
}

/** What tells one set of options from the next: a wrong pick on clue 3 disables one on clue 4. */
function setKeyOf(options: readonly OptionView[]): string {
  return options
    .map(
      (option) => `${String(option.index)}${option.alreadyGuessed ? "x" : ""}`,
    )
    .join(" ");
}

/** The option index of the element a focus or key event came from, or null. */
function optionAt(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const item = target.closest<HTMLElement>("[data-option]");
  const value = item?.dataset.option;
  return value === undefined ? null : Number(value);
}

export function MysteryOptions(props: MysteryOptionsProps) {
  const leadId = useId();
  const keysId = useId();
  const {
    options,
    last,
    busy,
    disabled,
    shortcuts,
    keys,
    sound,
    haptics,
    labelledBy,
    groupRef,
    focusTarget = "clue_heading",
    onReady,
    onPick,
  } = props;
  const copy = MYSTERY_COPY.options;
  const digits = digitsPick(options);
  const locked = busy || disabled;

  /** The chosen option, waiting for Lock in or Enter (D31). */
  const [chosen, setChosen] = useState<number | null>(null);
  // A new set of options (clue 4 after a wrong pick on clue 3) starts unchosen.
  const setKey = setKeyOf(options);
  const [shownSet, setShownSet] = useState(setKey);
  if (shownSet !== setKey) {
    setShownSet(setKey);
    setChosen(null);
  }

  /** Until when a key among the options still counts as typing (`TYPING_MS`). */
  const typingUntil = useRef(0);
  /** Until when a Space just after a key chose still reads as a typed name's space ("B Smith"). */
  const spaceGuardUntil = useRef(0);
  /** How many letters and digits have been pressed in this run of keys (`WORD_KEYS`). */
  const keyCount = useRef(0);
  /** When the last letter or digit came down (`WORD_PAUSE_MS`). */
  const lastKeyAt = useRef(Number.NEGATIVE_INFINITY);
  /**
   * A word has been typed among the options (`WORD_KEYS`): the keys choose
   * and lock nothing until Escape, Tab or a pointer. State as well as a
   * ref, since the legend says so and a key reads it before the next draw.
   */
  const wordTyped = useRef(false);
  const [typedWord, setTypedWord] = useState(false);
  /** Where and when a pointer last chose an option (`DOUBLE_TAP_MS`). */
  const chosenByPointer = useRef({
    at: Number.NEGATIVE_INFINITY,
    x: 0,
    y: 0,
  });
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  /**
   * True while a key moves focus, to an option or back to the group, so
   * `onFocus` can tell it from Tab, a pointer or the options arriving.
   */
  const keyFocusing = useRef(false);
  /**
   * Whether a key that names no option, or a typed name's space, has come
   * since a key last chose an option on its own, or focus last reached an
   * option by Tab or a pointer (R3-05 after review). While it holds, Enter
   * commits and chooses nothing. One or two keys only: a third makes a
   * word (`wordTyped`), which no later key undoes.
   */
  const typedSinceChoice = useRef(false);
  /** What was last said of the choice, taken back when typing clears the mark (R4-11). */
  const said = useRef<HTMLElement | null>(null);

  // Once drawn: the round focuses the group and scrolls the options into view.
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  /** Focus came to the options afresh: nothing is typed yet. */
  function startAfresh() {
    typedSinceChoice.current = false;
    typingUntil.current = 0;
    spaceGuardUntil.current = 0;
    keyCount.current = 0;
    lastKeyAt.current = Number.NEGATIVE_INFINITY;
    wordTyped.current = false;
    setTypedWord(false);
  }

  // The route is hidden with the round kept (Leave, then Continue brings
  // it back): the mark goes, as a reload would lose it, so the player
  // comes back to four options and nothing chosen. In a layout effect's
  // cleanup, which runs as the route hides.
  useLayoutEffect(
    () => () => {
      setChosen(null);
      setTypedWord(false);
      typedSinceChoice.current = false;
      typingUntil.current = 0;
      spaceGuardUntil.current = 0;
      keyCount.current = 0;
      lastKeyAt.current = Number.NEGATIVE_INFINITY;
      wordTyped.current = false;
      withdrawAnnouncement(said.current);
      said.current = null;
    },
    [],
  );

  const legendKind: LegendKind = !shortcuts
    ? "tap"
    : typedWord
      ? "typed"
      : keys
        ? "keys"
        : "tap";

  /** The chosen option, unless it can no longer be picked. */
  const choice =
    options.find(
      (option) => option.index === chosen && !option.alreadyGuessed,
    ) ?? null;
  /** The option that is marked and still idle: AnswerButton exposes it as `aria-pressed` (R3-09). */
  const marked = choice !== null && !locked ? choice.index : null;

  function lockIn(index: number) {
    if (haptics) vibrate(HAPTICS.lockIn);
    onPick(index);
  }

  /** Moves focus to an option as a key's doing. */
  function focusByKey(index: number) {
    keyFocusing.current = true;
    buttons.current.get(index)?.focus();
    keyFocusing.current = false;
  }

  /**
   * Marks an option and says so (D31, R4-11). Nothing is sent. Only a
   * key's own choice is told that Enter locks it in: a click may be a
   * screen reader's, which sends no keydown, so Enter there would only
   * choose again.
   */
  function choose(option: OptionView, byKey: boolean) {
    // A pointer's choice is no typing, wherever focus already was.
    if (byKey) typedSinceChoice.current = false;
    else startAfresh();
    setChosen(option.index);
    said.current = announce(copy.chosenNamed(option.label, byKey));
  }

  function unmark() {
    setChosen(null);
    withdrawAnnouncement(said.current);
    said.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    // Keys act only while focus is in the group: on an option (D20), or on
    // the group itself, where focus lands as the options arrive (D28).
    // Never on the Lock in button, whose Enter and Space are its own.
    const from = optionAt(event.target);
    const onGroup = event.target === event.currentTarget;
    if (from === null && !onGroup) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (locked) return;
    const { key } = event;
    if (key === "Escape") {
      // Clears the mark, and ends a typed word: the keys choose again.
      if (chosen === null && keyCount.current === 0) return;
      event.preventDefault();
      startAfresh();
      unmark();
      return;
    }
    const now = keyTime();
    const typing = now < typingUntil.current;
    if (key === "Enter") {
      // On the group, before any option has focus, Enter does nothing.
      if (from === null) return;
      // Never the button's own click: Enter chooses first, and only then
      // locks in (D31).
      event.preventDefault();
      if (event.repeat) return;
      // D20's typing guard (D28, R3-05 after review): Enter after a typed
      // word is the word's end, however long the pause, and inside the
      // typing window it acts only on the option already chosen.
      if (
        wordTyped.current ||
        typedSinceChoice.current ||
        (typing && chosen !== from)
      ) {
        typingUntil.current = now + TYPING_MS;
        return;
      }
      if (marked === from) {
        lockIn(from);
        return;
      }
      const option = options.find((item) => item.index === from);
      if (option !== undefined && !option.alreadyGuessed) choose(option, true);
      return;
    }
    if (key === " ") {
      if (from === null) {
        // No option has focus: a space is typing. Inside a typed name it
        // does nothing; a first space still scrolls the page, as it would
        // anywhere (R3-05 after review), and opens the typing window.
        if (typing || wordTyped.current) {
          event.preventDefault();
          typedSinceChoice.current = true;
        }
        typingUntil.current = now + TYPING_MS;
        return;
      }
      // On an option Space never clicks: it chooses, here (D31).
      event.preventDefault();
      if (wordTyped.current || typing || now < spaceGuardUntil.current) {
        // A letter in a typed name ("B Smith").
        typingUntil.current = now + TYPING_MS;
        typedSinceChoice.current = true;
        return;
      }
      if (event.repeat) return;
      const option = options.find((item) => item.index === from);
      if (option !== undefined && !option.alreadyGuessed) choose(option, true);
      return;
    }
    // The letters and digits are the shortcuts Settings can switch off;
    // Enter, Space and Escape above are any button's keys.
    if (!shortcuts || key.length !== 1) return;
    // A held key repeats: the first press counted, and a repeat is no second press.
    const option = optionForKey(key, options);
    if (event.repeat) {
      if (option !== null) event.preventDefault();
      return;
    }
    // Three keys in a run are a word, whatever their letters (D31,
    // R4-11): from the third on, nothing is chosen until Escape, Tab or a
    // pointer, and the legend and the status region say so. A key after a
    // pause of `WORD_PAUSE_MS` starts a new run (D38, R5-04), so slow,
    // deliberate changes of mind never add up to a word.
    if (now - lastKeyAt.current >= WORD_PAUSE_MS) keyCount.current = 0;
    lastKeyAt.current = now;
    keyCount.current += 1;
    if (keyCount.current >= WORD_KEYS && !wordTyped.current) {
      wordTyped.current = true;
      setTypedWord(true);
      unmark();
      said.current = announce(copy.typedLegend);
      // No option keeps a ring that reads as a choice (D38): focus goes
      // back to the group, as when the options arrived.
      if (from !== null) {
        keyFocusing.current = true;
        event.currentTarget.focus({ preventScroll: true });
        keyFocusing.current = false;
      }
    }
    const word = wordTyped.current;
    if (option === null) {
      // Any other printable key is typing: it clears the mark and what was
      // said of it.
      typingUntil.current = now + TYPING_MS;
      // A key for an already-guessed option aims at an option, not a name:
      // it chooses nothing, but on its own leaves Enter as it was.
      if (word || optionNamedBy(key, options) === undefined) {
        typedSinceChoice.current = true;
      }
      if (!word) unmark();
      return;
    }
    event.preventDefault();
    if (word) {
      // Once a word is typed an option key does nothing: focus rests on
      // the group (D38), and nothing says "Enter locks it in" over a
      // letter of a name ("Mira Tolland", "Abba").
      typingUntil.current = now + TYPING_MS;
      typedSinceChoice.current = true;
      return;
    }
    if (typing && typedSinceChoice.current) {
      // Straight after a typed key an option key only moves focus to its
      // option. Nothing is marked, and Enter there does nothing.
      typingUntil.current = now + TYPING_MS;
      unmark();
      if (from !== option.index) focusByKey(option.index);
      return;
    }
    // The mark moving between options may be a word's start ("Abby").
    if (chosen !== null && chosen !== option.index) {
      typingUntil.current = now + TYPING_MS;
    }
    spaceGuardUntil.current = now + TYPING_MS;
    if (from !== option.index) focusByKey(option.index);
    choose(option, true);
  }

  return (
    <div
      ref={groupRef}
      role="group"
      tabIndex={-1}
      aria-labelledby={labelledBy ?? leadId}
      aria-describedby={
        labelledBy === undefined ? keysId : `${leadId} ${keysId}`
      }
      {...focusTargetProps(focusTarget)}
      data-options=""
      data-digits={shortcuts && digits ? "" : undefined}
      // Focused as the options arrive (D28): the ring the clue card draws
      // for its heading, around the whole group.
      className="group/options rounded-[14px] outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-[color:var(--kn-focus,var(--foreground))]"
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        // Where a button clicks as Space comes up, it doesn't here: Space
        // was dealt with on the way down.
        if (event.key === " " && optionAt(event.target) !== null) {
          event.preventDefault();
        }
      }}
      onFocus={(event) => {
        // Reached by Tab or a pointer, or the group focused afresh as a set
        // of options arrives: nothing is typed yet. The mark stays where it
        // is (D31).
        if (keyFocusing.current) return;
        if (
          optionAt(event.target) !== null ||
          event.target === event.currentTarget
        ) {
          startAfresh();
        }
      }}
    >
      <p
        id={leadId}
        data-options-lead=""
        className={cx(
          "mt-3 text-[0.8125rem] font-bold tracking-[0.01em] text-pretty",
          TONE.ink3,
        )}
      >
        {last ? copy.lastLead : copy.lead}
      </p>
      {/* D32: one line, always drawn, saying what is true for the device,
          or that a typed word has switched the keys off. The same cell
          holds room for the other wordings, so the line is as tall as any
          and nothing moves when a key changes it. CSS draws that reserve
          from an attribute: it is not in the page's text (R4-03). */}
      <p
        id={keysId}
        className={cx("mt-1 grid text-[0.8125rem] font-semibold", TONE.ink2)}
      >
        <span data-keys-legend={legendKind} className="col-start-1 row-start-1">
          {LEGENDS[legendKind]}
        </span>
        {shortcuts
          ? LEGEND_KINDS.filter((kind) => kind !== legendKind).map((kind) => (
              <span
                key={kind}
                aria-hidden="true"
                data-reserve={LEGENDS[kind]}
                className="invisible col-start-1 row-start-1 after:content-[attr(data-reserve)]"
              />
            ))
          : null}
      </p>
      {/* grid-cols-1 is minmax(0, 1fr): the longest word in a label can't
          widen the column past the screen, as "Ferryman" took it to 331 px
          of 296 at 200% text on a 360 px phone (R1-03); it breaks instead. */}
      {/* The options and their bar share a box of their own: the sticky
          bar is held inside it, so it starts at option A and never covers
          the lead line or the legend above. */}
      <div
        data-options-box=""
        onClickCapture={(event) => {
          const place = placeOf(event);
          if (place === null || optionAt(event.target) === null) return;
          chosenByPointer.current = { at: keyTime(), ...place };
        }}
      >
        <ol className="mt-2 grid grid-cols-1 gap-2.5">
          {options.map((option, position) => {
            const state = stateOf(option, props);
            const isMarked = marked === option.index;
            return (
              <li
                key={option.index}
                data-option={option.index}
                data-chosen={isMarked ? "" : undefined}
                className="min-w-0"
              >
                <AnswerButton
                  ref={(button) => {
                    if (button === null) buttons.current.delete(option.index);
                    else buttons.current.set(option.index, button);
                  }}
                  index={option.index}
                  state={state}
                  pressed={isMarked}
                  className={isMarked ? CHOSEN_BADGE : undefined}
                  aria-pressed={isMarked}
                  // The badge is the key hint (D6); AnswerButton names the keys
                  // to assistive tech, only while the option is idle.
                  shortcut={shortcuts ? keysFor(position, digits) : null}
                  onPressStart={() => {
                    if (sound) playEffect("tap");
                  }}
                  // A tap or a click chooses, as a key does (D31). Focus goes
                  // with it where the browser leaves it behind, so Enter then
                  // locks in what was tapped.
                  onCommit={() => {
                    buttons.current.get(option.index)?.focus();
                    choose(option, false);
                  }}
                >
                  {option.label}
                </AnswerButton>
              </li>
            );
          })}
        </ol>
        <LockInBar
          label={choice === null ? null : choice.label}
          disabled={choice === null || disabled}
          busy={busy}
          onLockIn={(event) => {
            if (marked === null) return;
            // The second tap of a double tap on an option, should the bar
            // ever be under it by then, is not a lock-in (D31).
            const tap = chosenByPointer.current;
            const place = placeOf(event);
            if (
              place !== null &&
              keyTime() - tap.at < DOUBLE_TAP_MS &&
              Math.hypot(place.x - tap.x, place.y - tap.y) < DOUBLE_TAP_PX
            ) {
              return;
            }
            lockIn(marked);
          }}
        />
      </div>
    </div>
  );
}
