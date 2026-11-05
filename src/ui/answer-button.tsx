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
 * - The state's words sit at the right end of the option's line, beside a
 *   name that leaves room for them, and go under it only where it doesn't
 *   (a long name, 200% text). Either way the name keeps its whole line, so
 *   a pill never squeezes the answer onto two or three lines (RITE round
 *   1, R1-36), and a short option never grows at the reveal (`.kn-answer`
 *   in `ui.css`).
 * - The letter is said once (R1-40 checked for a doubled one). Screen
 *   readers get "A." from one visually hidden element, so the accessible
 *   name contains the visible label once, "A. Venus Your answer" (WCAG
 *   2.5.3). The badge draws the letter as generated content (`data-letter`)
 *   and is hidden from them, so no reading of the button, its text content
 *   included, meets the letter twice. Where a check or an X replaces the
 *   letter, the hidden "A." stays. The `{" "}` text nodes between the
 *   parts keep the words of the name apart; flex layout ignores them.
 * - The badge's letter is also the option's one key hint.
 * - Keys are the round's job (decision D6, R1-13: the letters A to D pick,
 *   matching the badges, and digits 1 to 4 only where no option is a
 *   number). `shortcut` names the keys that pick this option, in
 *   `aria-keyshortcuts` form ("A 1", or "A"), set only while it is idle;
 *   nothing else draws a hint, since the badge already shows the letter.
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
  /**
   * The keys that pick this option, as `aria-keyshortcuts` lists them ("A
   * 1", or "A" where digits don't pick); null or absent when shortcuts are
   * off. Drawn nowhere: the badge's letter is the hint (D6).
   */
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
  const Glyph =
    state === "correct"
      ? CheckIcon
      : state === "your-answer"
        ? CrossIcon
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
      <span
        aria-hidden="true"
        data-letter={Glyph === null ? letter : undefined}
        className="kn-answer-badge"
      >
        {Glyph === null ? null : <Glyph />}
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
    </button>
  );
}
