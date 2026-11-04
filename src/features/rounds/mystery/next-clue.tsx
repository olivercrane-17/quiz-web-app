"use client";

/**
 * Next clue (PRD §3.1.4, DESIGN §6.3): a real button that names what the
 * next clue is worth. A wrong guess costs exactly the same, so the label
 * never steers anyone away from having a go.
 *
 * - Clue 1: "Next clue · then worth 3"; clue 2: "Next clue · then worth 2";
 *   clue 3: "Last clue and options · then worth 1".
 * - With `options_from_clue` 3: clue 2 reads "Next clue and options · then
 *   worth 2" and clue 3 "Last clue · then worth 1".
 *
 * The accessible name is the whole label, separator included, so it holds
 * the visible text (WCAG 2.5.3). At large text sizes the worth wraps under
 * the action rather than running off the screen (PRD §3.12.4).
 *
 * It sits after the guess field (or the options), in reading and focus
 * order, so the first Tab from the heading reaches the field and not a
 * button that costs a point (D15). Pressing it keeps focus where it is
 * until the click lands: a blur from the field would close its list (or
 * its "No matches" line) and lift the button out from under the pointer
 * before the release, so the click would miss. Focus then moves to the new
 * clue's heading as usual.
 *
 * While the keyboard is open the button sits beside the field (`compact`):
 * the action over the worth in short lines ("Next clue" over "then worth
 * 2", "Last clue" over "and options" over "then worth 1"), so the field
 * keeps room for the name, and every word of the label still shows in the
 * order it is read (AC-DLY-29, R1-33, WCAG 2.5.3). Keeping focus in the
 * field there also keeps the keyboard up through the press.
 */
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";

import { MYSTERY_COPY } from "./copy";
import { keepFieldFocus } from "./focus";
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
  const copy = MYSTERY_COPY.nextClue;
  const thenWorth = copy.thenWorth(label.worth);
  if (compact) {
    // "Next clue" or "Last clue", then the rest of the action ("and
    // options") on a line of its own, then the worth: the visible words are
    // the name's, in its order ("Last clue and options · then worth 1").
    const short = label.action.startsWith(copy.last) ? copy.last : copy.next;
    const rest = label.action.slice(short.length).trim();
    return (
      <Button
        variant="secondary"
        data-next-clue=""
        data-compact=""
        disabled={disabled}
        focusableWhenDisabled
        busy={busy}
        onMouseDown={keepFieldFocus}
        onClick={onPress}
        // The marked utilities override the variant's own (cx doesn't merge them).
        className={cx(
          "min-h-11! shrink-0 flex-col items-start! justify-center gap-0! rounded-[14px]! px-3! py-1 text-left text-sm leading-tight",
          TONE.surface,
          TONE.ledge,
        )}
      >
        <span>{short}</span>{" "}
        {rest === "" ? null : (
          <>
            <span data-rest="" className="text-xs">
              {rest}
            </span>{" "}
          </>
        )}
        <span className="sr-only">·</span>{" "}
        <span data-worth="" className={cx("text-xs font-semibold", TONE.ink2)}>
          {thenWorth}
        </span>
      </Button>
    );
  }
  return (
    <Button
      variant="secondary"
      data-next-clue=""
      disabled={disabled}
      focusableWhenDisabled
      busy={busy}
      // A pointer press leaves focus in the field until the click lands
      // (above): the list it would close sits between the field and here.
      onMouseDown={keepFieldFocus}
      onClick={onPress}
      className={cx(
        "min-h-12 w-full flex-wrap justify-between gap-x-3 gap-y-0.5 rounded-[14px]! px-3! py-1.5 text-left text-base whitespace-normal!",
        TONE.surface,
        TONE.ledge,
      )}
    >
      <span className="inline-flex items-center gap-2">
        <NextClueIcon size={20} />
        {label.action}
      </span>{" "}
      <span className="sr-only">·</span>{" "}
      {/* One piece that drops under the action when the two can't share a line. */}
      <span
        className={cx("text-sm font-semibold whitespace-nowrap", TONE.ink2)}
      >
        {thenWorth}
      </span>
    </Button>
  );
}
