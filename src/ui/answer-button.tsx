"use client";

/**
 * One answer option (PRD §3.0.3, DESIGN §6.2). Multiple choice, true/false,
 * comparison, the options on a Mystery's last clue, room phones and user
 * quizzes all use it.
 *
 * - Commit on release: the pressed look appears on `pointerdown` (same
 *   frame), the answer commits on `click`, so sliding off cancels.
 *   `onPressStart` runs with the press, for the tap sound (DESIGN §8). The
 *   haptic belongs to the commit, never the press: vibrate with
 *   `HAPTICS.lockIn` in `onCommit` (DESIGN §9), because a pointerdown also
 *   starts every scroll that begins on an option.
 * - At least `TUNABLES.answers.buttonMinHeightPx` tall (PRD §3.0.3), read
 *   from config so the tunable moves it; the content builds it taller.
 * - Only an `idle` option is interactive. Every other state keeps the
 *   button focusable with `aria-disabled`, so focus never falls to the page
 *   after a verdict and a screen reader can still read the state's words.
 * - Never colour alone: the states differ by border, badge glyph and words
 *   ("Correct answer", "Your answer", "Already guessed"). Every state is
 *   exposed as `data-state` (plus `data-pressed`), which `.kn-answer` in
 *   `ui.css` styles: the fills, the 400 ms reveal's stamp, shake and tag
 *   rise (DESIGN §7.3), and the forced-colours borders (double for correct,
 *   dashed for a wrong pick).
 * - The letter badge reads "A." to screen readers, so the accessible name
 *   contains the visible label: "A. Venus Your answer" (WCAG 2.5.3). The
 *   `{" "}` text nodes between the parts keep the words of that name apart;
 *   flex layout ignores them.
 * - Keys 1 to 4 are the round's job (they work while focus is in the
 *   question); `shortcut` only shows the hint and sets `aria-keyshortcuts`.
 */
import type { ReactNode, Ref } from "react";

import { TUNABLES } from "@/config/tunables";

import { UI_COPY, type AnswerButtonLabels } from "./copy";
import { cx } from "./cx";
import { CheckIcon, CrossIcon } from "./icons";
import { usePressed } from "./use-pressed";

export const ANSWER_STATES = [
  /** Interactive. */
  "idle",
  /** The player's pick while its verdict is on the way (by 150 ms; sealed modes may wait). */
  "locked",
  /** The right answer, once revealed. */
  "correct",
  /** The player's wrong pick, once revealed. */
  "your-answer",
  /** Every other option after the reveal: dimmed, but its text keeps 4.5:1. */
  "dimmed",
  /** A clue-4 option the player already guessed. */
  "already-guessed",
  /** Looks idle but can't be used, such as offline in a sealed round; the alert explains. */
  "disabled",
] as const;
export type AnswerState = (typeof ANSWER_STATES)[number];

const LETTERS = "ABCDEFGH";

/** The badge letter of the option at `index`: "A" for 0. */
export function answerLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

export interface AnswerButtonProps {
  /** The option's position, 0 for A. */
  index: number;
  /** The option text, as shown. It wraps and grows the button. */
  children: ReactNode;
  state?: AnswerState;
  /** The answer itself: runs on click (release), only while `idle`. */
  onCommit?: () => void;
  /**
   * Runs on `pointerdown` while `idle`, before any commit: for the tap
   * sound. Vibrate on commit instead (`HAPTICS.lockIn` in `onCommit`).
   */
  onPressStart?: () => void;
  /** Forces the pressed look, such as while the option's shortcut key is held. */
  pressed?: boolean;
  /** The key that picks this option ("1" to "4"); null or absent when shortcuts are off. */
  shortcut?: string | null;
  /** Wording for the state words; the defaults are UI_COPY.answer. */
  labels?: Partial<AnswerButtonLabels>;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
  ref?: Ref<HTMLButtonElement>;
}

export function AnswerButton({
  index,
  children,
  state = "idle",
  onCommit,
  onPressStart,
  pressed = false,
  shortcut = null,
  labels,
  id,
  className,
  "aria-describedby": describedBy,
  ref,
}: AnswerButtonProps) {
  const interactive = state === "idle";
  const [pointerPressed, pressHandlers] = usePressed(interactive, onPressStart);
  const showPressed = interactive && (pressed || pointerPressed);
  const words = { ...UI_COPY.answer, ...labels };
  const letter = answerLetter(index);

  const tag =
    state === "correct"
      ? words.correct
      : state === "your-answer"
        ? words.yourAnswer
        : state === "already-guessed"
          ? words.alreadyGuessed
          : null;

  return (
    <button
      ref={ref}
      id={id}
      type="button"
      data-state={state}
      data-pressed={showPressed ? "" : undefined}
      aria-disabled={interactive ? undefined : true}
      aria-keyshortcuts={interactive && shortcut ? shortcut : undefined}
      aria-describedby={describedBy}
      onClick={() => {
        if (interactive) onCommit?.();
      }}
      {...pressHandlers}
      style={{ minHeight: TUNABLES.answers.buttonMinHeightPx }}
      className={cx("kn-answer", className)}
    >
      <span aria-hidden="true" className="kn-answer-badge">
        {state === "correct" ? (
          <CheckIcon />
        ) : state === "your-answer" ? (
          <CrossIcon />
        ) : (
          letter
        )}
      </span>
      <span className="sr-only">{letter}.</span>{" "}
      <span className="kn-answer-text">{children}</span>{" "}
      {tag === null ? null : (
        <span className="kn-answer-tag">
          {state === "correct" ? <CheckIcon size={14} /> : null}
          {tag}
        </span>
      )}
      {state === "locked" ? (
        <span className="sr-only">{words.lockedIn}</span>
      ) : null}
      {interactive && shortcut ? (
        <kbd aria-hidden="true" className="kn-answer-kbd">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}
