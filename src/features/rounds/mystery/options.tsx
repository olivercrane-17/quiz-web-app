"use client";

/**
 * The four options of a Mystery's last clue (PRD §3.1.4, §3.0.3; DESIGN
 * §6.2, §12.2): answer buttons A to D on CORE-0b's AnswerButton, which
 * commits on release. An option the player already guessed shows disabled
 * with "Already guessed"; the picked option holds its locked look while the
 * server judges it, and the others wait, disabled. Their line says what the
 * pick is worth knowing: on clue 4, "Last clue. Pick one of four. One pick:
 * a wrong one scores 0." (D24, R2-16); with options from clue 3, a later
 * clue is still to come, so "Pick one of four".
 *
 * Keys (D20, amending D6; RITE round 2, R2-02; D28, RITE round 3, R3-05).
 * The group listens, never the round: letters and digits act only while
 * focus is in the options group (on the group itself or on an option), so a
 * key pressed on a heading, the page or anywhere else does nothing (WCAG
 * 2.1.4's "active only on focus", until Settings has the switch). As the
 * options arrive focus goes to the group (D28), which is labelled by the
 * clue's heading and described by its lead line and the legend, so a
 * screen reader hears the new clue first and A then Enter works with no
 * Tab. The group carries the `clue_heading` focus target while it shows.
 *
 * - A key chooses: focus moves to that option, which is marked (the
 *   pressed look, an inked badge, and "Chosen. Enter locks it in." as its
 *   description, read as focus lands on it). Nothing is sent.
 * - Enter, or the same key pressed again with nothing typed in between,
 *   locks the chosen option in. A held key never repeats its way into a
 *   lock-in, and the round sends one pick only (`MysteryRound`).
 * - Typing among the options is not a lock-in (R2-02 after review): any
 *   other printable key clears the mark and opens a short typing window
 *   (`TYPING_MS`, renewed by each key typed in it, and opened too when a
 *   key moves the mark from one option to another). Inside it an option
 *   key only chooses, and Space does nothing, so a name typed with focus
 *   on an option ("Odile Marsh", "Cartographer", "Abby") sends nothing.
 *   Once a name's other letters have been typed, an option key inside the
 *   window only moves focus, unmarked, since Enter won't lock it in (next
 *   point); a run of option keys alone ("b", "d", "a") still moves the
 *   mark. A Space straight after a key chose ("B Smith") is typing too. Space
 *   otherwise acts like a key for the focused option: it chooses it, and
 *   only once it is chosen does Space lock it in, as Enter does.
 * - Letters A to D match the badges; digits 1 to 4 choose only when no
 *   option reads as a number, so "4" can never mean option D when four is
 *   an answer (D6, R1-13). Each option names its keys in
 *   `aria-keyshortcuts` ("C 3", or "C"), and the badge is the one hint
 *   drawn on it.
 * - Enter after a typed name is not a lock-in either (R3-05 after review):
 *   once a name has been typed since a key last chose on its own (or since
 *   Tab or a pointer reached an option), Enter commits nothing on an
 *   option that isn't marked, so "Cartographer" then Enter sends nothing,
 *   however long the pause; inside the typing window it commits nothing
 *   at all unless the option was marked with nothing typed since.
 * - On the group itself, before any option has focus, a key chooses as it
 *   does from an option (focus moves to it), Space opens the typing window
 *   (a first Space still scrolls the page; one inside a typed name does
 *   nothing), and Enter does nothing.
 * - Escape, or focus moving on, clears the mark: what Enter locks in is
 *   always the option that has focus. The chosen option is exposed as
 *   `aria-pressed="true"` as well as by its description (R3-09).
 * - From the moment the options appear, while shortcuts are on, the line
 *   above them, under their lead, says how (D28): "Keys A to D choose.
 *   Enter locks in." Its line is always drawn, so nothing moves when focus
 *   or a key reaches the options (above, so a phone at 200% text still
 *   shows it beside the option a key moves to). The group's description
 *   says the same, for screen readers. Pointers are untouched: a tap still
 *   commits on release.
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";

import type { OptionView } from "@/engine/types";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { announce } from "@/ui/announce";
import { AnswerButton, type AnswerState } from "@/ui/answer-button";
import { cx } from "@/ui/cx";

import { MYSTERY_COPY } from "./copy";
import { focusTargetProps } from "./focus";
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
 * The chosen option's mark, beside the pressed look AnswerButton draws for
 * `pressed`: its badge turns ink with the letter in the page's colour, so
 * the mark is a fill and a shape, never a hue alone. Forced colours paint
 * the badge in the system highlight.
 */
const CHOSEN_BADGE = cx(
  "[&_.kn-answer-badge]:bg-[color:var(--kn-ink,var(--foreground))] [&_.kn-answer-badge]:text-[color:var(--kn-surface,var(--background))]",
  "forced-colors:[&_.kn-answer-badge]:bg-[color:Highlight] forced-colors:[&_.kn-answer-badge]:text-[color:HighlightText] forced-colors:[&_.kn-answer-badge]:forced-color-adjust-none",
);

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
  const chosenId = useId();
  const {
    options,
    last,
    busy,
    disabled,
    shortcuts,
    sound,
    haptics,
    labelledBy,
    groupRef,
    onPick,
  } = props;
  const digits = digitsPick(options);
  const locked = busy || disabled;

  /** The option a key chose, waiting for Enter or the same key (D20). */
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
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  /** The option a key chose, to focus once it is drawn as chosen, so its description is read with it. */
  const focusNext = useRef<number | null>(null);
  /** True while a key moves focus to the option it chose, so `onFocus` can tell it from Tab or a pointer. */
  const keyFocusing = useRef(false);
  /**
   * Whether a name has been typed since a key last chose an option on its
   * own, outside the typing window, or focus last reached an option by Tab
   * or a pointer (R3-05 after review). While it holds, Enter on an option
   * that isn't marked commits nothing, so "Cartographer" then Enter, with
   * focus left on an option by its letters, sends no pick, even after a
   * pause.
   */
  const typedSinceChoice = useRef(false);
  useLayoutEffect(() => {
    const index = focusNext.current;
    if (index === null) return;
    focusNext.current = null;
    keyFocusing.current = true;
    buttons.current.get(index)?.focus();
    keyFocusing.current = false;
  }, [chosen]);

  /** The option that is marked and still idle: AnswerButton exposes it as `aria-pressed` (R3-09). */
  const marked =
    chosen !== null &&
    options.some(
      (option) => option.index === chosen && stateOf(option, props) === "idle",
    )
      ? chosen
      : null;
  function lockIn(index: number) {
    if (haptics) vibrate(HAPTICS.lockIn);
    onPick(index);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!shortcuts || event.nativeEvent.isComposing) return;
    // Keys act only while focus is in the group: on an option (D20), or on
    // the group itself, where focus lands as the options arrive (D28).
    const from = optionAt(event.target);
    const onGroup = event.target === event.currentTarget;
    if (from === null && !onGroup) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (locked) return;
    if (event.key === "Escape") {
      if (chosen === null) return;
      event.preventDefault();
      setChosen(null);
      return;
    }
    const now = performance.now();
    const typing = now < typingUntil.current;
    if (event.key === "Enter" && from !== null) {
      // D20's typing guard (D28, R3-05 after review): Enter after a typed
      // name is the name's end, not a lock-in, however long the pause. It
      // locks in only an option a key chose on its own (marked), or one
      // Tab or a pointer reached, with nothing typed since.
      if (typedSinceChoice.current || (typing && chosen !== from)) {
        event.preventDefault();
        typingUntil.current = now + TYPING_MS;
        return;
      }
    }
    if (event.key === " " && from === null) {
      // No option has focus: a space is typing. Inside a typed name it does
      // nothing; a first space still scrolls the page, as it would anywhere
      // (R3-05 after review), and opens the typing window.
      if (typing) {
        event.preventDefault();
        typedSinceChoice.current = true;
      }
      typingUntil.current = now + TYPING_MS;
      return;
    }
    if (event.key === " " && from !== null) {
      // Space is a letter in a typed name: inside the typing window it does
      // nothing, and otherwise it chooses the focused option before it can
      // lock it in, so a name with a space can't press the button.
      if (typing || now < spaceGuardUntil.current) {
        event.preventDefault();
        typingUntil.current = now + TYPING_MS;
        typedSinceChoice.current = true;
        return;
      }
      if (chosen === from) return; // The native click locks it in.
      event.preventDefault();
      if (event.repeat) return;
      const label = options.find((item) => item.index === from)?.label;
      typedSinceChoice.current = false;
      setChosen(from);
      if (label !== undefined) {
        announce(MYSTERY_COPY.options.chosenNamed(label));
      }
      return;
    }
    const option = optionForKey(event.key, options);
    if (option === null) {
      // Any other printable key is typing: it clears the mark, so "the same
      // key again" never spans letters typed in between.
      if (event.key.length === 1) {
        typingUntil.current = now + TYPING_MS;
        // A key for an already-guessed option aims at an option, not a
        // name: it chooses nothing, but leaves Enter as it was.
        if (optionNamedBy(event.key, options) === undefined) {
          typedSinceChoice.current = true;
        }
        setChosen(null);
      }
      return;
    }
    event.preventDefault();
    // A held key repeats: the first press chose, and a repeat is no second press.
    if (event.repeat) return;
    if (typing) {
      // Still typing: an option key only chooses, and keeps the window open.
      typingUntil.current = now + TYPING_MS;
      if (typedSinceChoice.current) {
        // Inside a typed name it only moves focus to its option. Nothing is
        // marked, so nothing says "Enter locks it in" over a letter of a
        // name ("Mira Tolland"), where Enter commits nothing.
        if (chosen !== null) setChosen(null);
        if (from !== option.index) {
          keyFocusing.current = true;
          buttons.current.get(option.index)?.focus();
          keyFocusing.current = false;
        }
        return;
      }
    } else if (chosen === option.index) {
      lockIn(option.index);
      return;
    } else {
      // A key chose on its own: Enter may lock it in.
      typedSinceChoice.current = false;
      // The mark moving between options reads as typing too ("Abby").
      if (chosen !== null) typingUntil.current = now + TYPING_MS;
    }
    if (chosen === option.index) return;
    spaceGuardUntil.current = now + TYPING_MS;
    setChosen(option.index);
    if (from === option.index) {
      // Focus stays put, so nothing new would be read: say it.
      announce(MYSTERY_COPY.options.chosenNamed(option.label));
    } else {
      focusNext.current = option.index;
    }
  }

  const describedBy = [labelledBy === undefined ? null : leadId]
    .concat(shortcuts ? keysId : null)
    .filter((id) => id !== null)
    .join(" ");

  return (
    <div
      ref={groupRef}
      role="group"
      tabIndex={-1}
      aria-labelledby={labelledBy ?? leadId}
      aria-describedby={describedBy === "" ? undefined : describedBy}
      {...focusTargetProps("clue_heading")}
      data-options=""
      data-digits={shortcuts && digits ? "" : undefined}
      // Focused as the options arrive (D28): the ring the clue card draws
      // for its heading, around the whole group.
      className="group/options rounded-[14px] outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-[color:var(--kn-focus,var(--foreground))]"
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        // Focus moved to another option: Enter locks in what has focus.
        const index = optionAt(event.target);
        // Reached by Tab or a pointer, or the group focused afresh as a set
        // of options arrives: nothing is typed yet.
        if (
          (index !== null && !keyFocusing.current) ||
          event.target === event.currentTarget
        ) {
          typedSinceChoice.current = false;
        }
        setChosen((current) => (current === index ? current : null));
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setChosen(null);
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
        {last ? MYSTERY_COPY.options.lastLead : MYSTERY_COPY.options.lead}
      </p>
      {shortcuts ? (
        <p id={keysId} className="sr-only">
          {MYSTERY_COPY.options.legend}
        </p>
      ) : null}
      {/* Referenced while an option is chosen; hidden, it is read only as that description. */}
      <p id={chosenId} hidden>
        {MYSTERY_COPY.options.chosen}
      </p>
      {shortcuts ? (
        // D28: from the moment the options appear, in a line of its own
        // under the lead and above the options, always drawn, so nothing
        // moves; on screen beside them at 200% text on a phone. Screen
        // readers hear the same words as the group's description.
        <p
          aria-hidden="true"
          data-keys-legend="shown"
          className={cx("mt-1 text-[0.8125rem] font-semibold", TONE.ink2)}
        >
          {MYSTERY_COPY.options.legend}
        </p>
      ) : null}
      {/* grid-cols-1 is minmax(0, 1fr): the longest word in a label can't
          widen the column past the screen, as "Ferryman" took it to 331 px
          of 296 at 200% text on a 360 px phone (R1-03); it breaks instead. */}
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
                aria-describedby={isMarked ? chosenId : undefined}
                aria-pressed={isMarked}
                // The badge is the key hint (D6); AnswerButton names the keys
                // to assistive tech, only while the option is idle.
                shortcut={shortcuts ? keysFor(position, digits) : null}
                onPressStart={() => {
                  if (sound) playEffect("tap");
                }}
                onCommit={() => {
                  lockIn(option.index);
                }}
              >
                {option.label}
              </AnswerButton>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
