"use client";

/**
 * Next clue (PRD §3.1.4, DESIGN §6.3): a real button that sits in the slot
 * where the next clue will land, naming what that clue is worth. A wrong
 * guess costs exactly the same, so the label never steers anyone away
 * from having a go.
 *
 * - Clue 1: "Next clue · then worth 3"; clue 2: "Next clue · then worth 2";
 *   clue 3: "Last clue and options · then worth 1".
 * - With `options_from_clue` 3: clue 2 reads "Next clue and options · then
 *   worth 2" and clue 3 "Last clue · then worth 1".
 *
 * The accessible name is the whole label, separator included, so it holds
 * the visible text (WCAG 2.5.3). While the keyboard is open the button
 * shrinks to sit beside the field (`compact`).
 */
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";

import { MYSTERY_COPY } from "./copy";
import { NextClueIcon } from "./icons";
import { TONE } from "./tones";

export interface NextClueLabel {
  action: string;
  worth: number;
}

/** What the button says on `clue`, or null on clue 4, where there is no next clue. */
export function nextClueLabel(
  clue: 1 | 2 | 3 | 4,
  optionsFromClue: 3 | 4,
  optionsShowing: boolean,
): NextClueLabel | null {
  if (clue === 4) return null;
  const next = clue + 1;
  const worth = 5 - next;
  const copy = MYSTERY_COPY.nextClue;
  if (next === 4) {
    const optionsAlready = optionsShowing || optionsFromClue <= 3;
    return { action: optionsAlready ? copy.last : copy.lastAndOptions, worth };
  }
  return {
    action:
      next === optionsFromClue && !optionsShowing
        ? copy.nextAndOptions
        : copy.next,
    worth,
  };
}

export interface NextClueButtonProps {
  label: NextClueLabel;
  busy: boolean;
  disabled: boolean;
  compact?: boolean;
  onPress(): void;
}

export function NextClueButton({
  label,
  busy,
  disabled,
  compact = false,
  onPress,
}: NextClueButtonProps) {
  const thenWorth = MYSTERY_COPY.nextClue.thenWorth(label.worth);
  return (
    <Button
      variant="secondary"
      data-next-clue=""
      disabled={disabled}
      focusableWhenDisabled
      busy={busy}
      onClick={onPress}
      className={cx(
        "rounded-[14px] text-base",
        TONE.surface,
        TONE.ledge,
        compact
          ? "min-h-11 shrink-0 flex-col gap-0 px-3 py-1 text-sm leading-tight"
          : "min-h-12 w-full justify-between px-3",
      )}
    >
      <span className="inline-flex items-center gap-2">
        {compact ? null : <NextClueIcon size={20} />}
        {label.action}
      </span>{" "}
      <span className="sr-only">·</span>{" "}
      <span
        className={cx(
          "font-semibold whitespace-nowrap",
          compact ? "text-xs" : "text-sm",
          TONE.ink2,
        )}
      >
        {thenWorth}
      </span>
    </Button>
  );
}
