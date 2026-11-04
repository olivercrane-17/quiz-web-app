"use client";

/**
 * The four options of a Mystery's last clue (PRD §3.1.4, §3.0.3; DESIGN
 * §6.2, §12.2): answer buttons A to D on CORE-0b's AnswerButton, which
 * commits on release. An option the player already guessed shows disabled
 * with "Already guessed"; the picked option holds its locked look while the
 * server judges it, and the others wait, disabled.
 *
 * Keys pick while focus is inside the round (the round binds them, through
 * `optionForKey`): letters A to D, matching the badges, and digits 1 to 4
 * only when no option reads as a number, so "4" can never mean option D
 * when four is an answer (D6, R1-13). The badge is the one key hint per
 * option, so no separate key hint shows, and the options' description
 * names the keys for screen readers.
 */
import { useId } from "react";

import type { OptionView } from "@/engine/types";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { AnswerButton, type AnswerState } from "@/ui/answer-button";
import { cx } from "@/ui/cx";

import { MYSTERY_COPY } from "./copy";
import { TONE } from "./tones";

const LETTER_KEYS = ["a", "b", "c", "d"] as const;
const DIGIT_KEYS = ["1", "2", "3", "4"] as const;

/** An option that reads as a number: its label starts with a digit ("15", "1,250 km", "1917"). */
function readsAsNumber(label: string): boolean {
  return /^\s*\p{Nd}/u.test(label);
}

/** Whether digits pick among these options (D6): only when none reads as a number. */
export function digitsPick(options: readonly OptionView[]): boolean {
  return !options.some((option) => readsAsNumber(option.label));
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

export function MysteryOptions(props: MysteryOptionsProps) {
  const leadId = useId();
  const keysId = useId();
  const { options, shortcuts, sound, haptics, onPick } = props;
  return (
    <div
      role="group"
      aria-labelledby={leadId}
      aria-describedby={shortcuts ? keysId : undefined}
      data-options=""
      data-digits={shortcuts && digitsPick(options) ? "" : undefined}
    >
      <p
        id={leadId}
        className={cx(
          "mt-3 text-[0.8125rem] font-bold tracking-[0.01em]",
          TONE.ink3,
        )}
      >
        {MYSTERY_COPY.options.lead}
      </p>
      {shortcuts ? (
        <p id={keysId} className="sr-only">
          {MYSTERY_COPY.options.keys(digitsPick(options))}
        </p>
      ) : null}
      {/* grid-cols-1 is minmax(0, 1fr): the longest word in a label can't
          widen the column past the screen, as "Ferryman" took it to 331 px
          of 296 at 200% text on a 360 px phone (R1-03); it breaks instead. */}
      <ol className="mt-2 grid grid-cols-1 gap-2.5">
        {options.map((option) => (
          <li key={option.index} className="min-w-0">
            <AnswerButton
              index={option.index}
              state={stateOf(option, props)}
              // The badge is the key hint (D6): no second one beside it.
              shortcut={null}
              onPressStart={() => {
                if (sound) playEffect("tap");
              }}
              onCommit={() => {
                if (haptics) vibrate(HAPTICS.lockIn);
                onPick(option.index);
              }}
            >
              {option.label}
            </AnswerButton>
          </li>
        ))}
      </ol>
    </div>
  );
}
