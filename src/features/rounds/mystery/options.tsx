"use client";

/**
 * The four options of a Mystery's last clue (PRD §3.1.4, §3.0.3; DESIGN
 * §6.2, §12.2): answer buttons A to D on CORE-0b's AnswerButton, which
 * commits on release. An option the player already guessed shows disabled
 * with "Already guessed"; the picked option holds its locked look while the
 * server judges it, and the others wait, disabled.
 *
 * Keys 1 to 4 pick while focus is inside the round (the round binds them),
 * so each button only shows its hint and sets `aria-keyshortcuts`.
 */
import { useId } from "react";

import type { OptionView } from "@/engine/types";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { AnswerButton, type AnswerState } from "@/ui/answer-button";
import { cx } from "@/ui/cx";

import { MYSTERY_COPY } from "./copy";
import { TONE } from "./tones";

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
  const { options, shortcuts, sound, haptics, onPick } = props;
  return (
    <div role="group" aria-labelledby={leadId} data-options="">
      <p
        id={leadId}
        className={cx(
          "mt-3 text-[13px] font-bold tracking-[0.01em]",
          TONE.ink3,
        )}
      >
        {MYSTERY_COPY.options.lead}
      </p>
      <ol className="mt-2 grid gap-2.5">
        {options.map((option) => (
          <li key={option.index}>
            <AnswerButton
              index={option.index}
              state={stateOf(option, props)}
              shortcut={shortcuts ? String(option.index + 1) : null}
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
