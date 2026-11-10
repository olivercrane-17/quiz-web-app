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
 * Keys (D20, amending D6; RITE round 2, R2-02). The group listens, never
 * the round: letters and digits act only while focus is on an option, so a
 * key pressed on a heading, the page or anywhere else does nothing (WCAG
 * 2.1.4's "active only on focus", until Settings has the switch). As the
 * options arrive focus goes to the clue's heading, so a name typed then
 * reaches no option at all.
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
 *   A Space straight after a key chose ("B Smith") is typing too. Space
 *   otherwise acts like a key for the focused option: it chooses it, and
 *   only once it is chosen does Space lock it in, as Enter does.
 * - Letters A to D match the badges; digits 1 to 4 choose only when no
 *   option reads as a number, so "4" can never mean option D when four is
 *   an answer (D6, R1-13). Each option names its keys in
 *   `aria-keyshortcuts` ("C 3", or "C"), and the badge is the one hint
 *   drawn on it.
 * - Escape, or focus moving on, clears the mark: what Enter locks in is
 *   always the option that has focus.
 * - Once a keyboard is in use (an option has focus-visible, or a key was
 *   pressed among the options), the line above them, under their lead,
 *   says how (above, so a phone at 200% text still shows it beside the
 *   option a key moves to): "Keys A to D
 *   choose. Enter locks in." The options' description says the same, for
 *   screen readers. Pointers are untouched: a tap still commits on release.
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { OptionView } from "@/engine/types";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { announce } from "@/ui/announce";
import { AnswerButton, type AnswerState } from "@/ui/answer-button";
import { cx } from "@/ui/cx";

import { MYSTERY_COPY } from "./copy";
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
  let position = LETTER_KEYS.indexOf(
    key.toLowerCase() as (typeof LETTER_KEYS)[number],
  );
  if (position < 0 && digitsPick(options)) {
    position = DIGIT_KEYS.indexOf(key as (typeof DIGIT_KEYS)[number]);
  }
  const option = position < 0 ? undefined : options[position];
  return option === undefined || option.alreadyGuessed ? null : option;
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
  const { options, last, busy, disabled, shortcuts, sound, haptics, onPick } =
    props;
  const digits = digitsPick(options);
  const locked = busy || disabled;

  /** The option a key chose, waiting for Enter or the same key (D20). */
  const [chosen, setChosen] = useState<number | null>(null);
  /** A key was pressed among the options: a keyboard is in use. */
  const [keysUsed, setKeysUsed] = useState(false);
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
  useLayoutEffect(() => {
    const index = focusNext.current;
    if (index === null) return;
    focusNext.current = null;
    buttons.current.get(index)?.focus();
  }, [chosen]);

  function lockIn(index: number) {
    if (haptics) vibrate(HAPTICS.lockIn);
    onPick(index);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!shortcuts || event.nativeEvent.isComposing) return;
    // Keys act only while focus is on an option (D20).
    const from = optionAt(event.target);
    if (from === null) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    setKeysUsed(true);
    if (locked) return;
    if (event.key === "Escape") {
      if (chosen === null) return;
      event.preventDefault();
      setChosen(null);
      return;
    }
    const now = performance.now();
    const typing = now < typingUntil.current;
    if (event.key === " ") {
      // Space is a letter in a typed name: inside the typing window it does
      // nothing, and otherwise it chooses the focused option before it can
      // lock it in, so a name with a space can't press the button.
      if (typing || now < spaceGuardUntil.current) {
        event.preventDefault();
        typingUntil.current = now + TYPING_MS;
        return;
      }
      if (chosen === from) return; // The native click locks it in.
      event.preventDefault();
      if (event.repeat) return;
      const label = options.find((item) => item.index === from)?.label;
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
    } else if (chosen === option.index) {
      lockIn(option.index);
      return;
    } else if (chosen !== null) {
      // The mark moving between options reads as typing too ("Abby").
      typingUntil.current = now + TYPING_MS;
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

  return (
    <div
      role="group"
      aria-labelledby={leadId}
      aria-describedby={shortcuts ? keysId : undefined}
      data-options=""
      data-digits={shortcuts && digits ? "" : undefined}
      className="group/options"
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        // Focus moved to another option: Enter locks in what has focus.
        const index = optionAt(event.target);
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
        // D20: once a keyboard is in use, under the lead and above the
        // options, so it stays on screen beside them at 200% text on a
        // phone. Screen readers hear the same words as the group's
        // description.
        <p
          aria-hidden="true"
          data-keys-legend={keysUsed ? "shown" : "on-focus"}
          className={cx(
            "mt-1 text-[0.8125rem] font-semibold",
            TONE.ink2,
            !keysUsed &&
              "hidden group-has-[.kn-answer:focus-visible]/options:block",
          )}
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
          const marked = chosen === option.index && state === "idle";
          return (
            <li
              key={option.index}
              data-option={option.index}
              data-chosen={marked ? "" : undefined}
              className="min-w-0"
            >
              <AnswerButton
                ref={(button) => {
                  if (button === null) buttons.current.delete(option.index);
                  else buttons.current.set(option.index, button);
                }}
                index={option.index}
                state={state}
                pressed={marked}
                className={marked ? CHOSEN_BADGE : undefined}
                aria-describedby={marked ? chosenId : undefined}
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
