/**
 * The clue ladder (PRD §3.1.4, DESIGN §6.3): a rail down the left past
 * numbered rungs, solid ink up to the current clue and dashed below it.
 *
 * - Past clues sit small and quiet; a wrong guess made on one is stamped
 *   onto it ("× Not Mary Shelley"), rotated like a rubber stamp and never
 *   struck through, so the name stays readable. The stamp turns about its
 *   middle, with room above and below, so neither end runs into the clue
 *   it sits under (R1-33).
 * - The current clue is a card with a "New" tag ("Last clue" on clue 4),
 *   and its heading takes focus after Next clue (DESIGN §6.4). The focus
 *   ring is the card's, rounded with it, rather than a square one inside
 *   it (R1-33).
 * - Under the current clue, `note` adds a line, such as the first-Daily
 *   hint under clue 1 (PRD §3.1.4).
 *
 * Next clue sits after the guess field, in reading and focus order (D15),
 * so the ladder holds clues only; the dashed rail below the current clue
 * says another is to come.
 *
 * Clues and stamps that arrive while the round is on screen animate in
 * (DESIGN §7.4); the ones a reload brings back are simply there.
 *
 * A word too long for a line of its own, as "lighthouse's" is at 200% text
 * on a 360 px phone, breaks inside the clue rather than running past the
 * card and widening the page (R1-03). Only such a word breaks: no
 * hyphenation, which would change every clue at every text size.
 */
import type { ReactNode, Ref } from "react";

import type { MysteryOpen } from "@/engine/rounds/mystery";
import { cx } from "@/ui/cx";
import { CrossIcon } from "@/ui/icons";

import { MYSTERY_COPY } from "./copy";
import { focusTargetProps } from "./focus";
import { DISPLAY_FONT, TONE, enter } from "./tones";

export interface ClueLadderProps {
  open: MysteryOpen;
  /** The clue showing when the round mounted: later clues animate in. */
  firstClue: number;
  /** The wrong guesses there were at mount: later stamps animate in. */
  firstGuesses: number;
  reducedMotion: boolean;
  /** The keyboard is open: older clues take one line, the current one less space. */
  compact: boolean;
  /** The options are showing: earlier clues drop a size so all four fit. */
  optionsShowing: boolean;
  clueHeadingRef: Ref<HTMLHeadingElement>;
  /** Whether a `clue_heading` focus request should land on the clue (else on the field). */
  headingIsFocusTarget: boolean;
  /** A line under the current clue's card, with the id the field's description points at. */
  note?: { id: string; text: string } | null;
}

/**
 * Clue text: a word too long for its line breaks, never runs past the card
 * (R1-03). It breaks at a syllable with a hyphen where the browser can
 * hyphenate (`lang="en"`, so "map-maker", "coast-line"), and anywhere only
 * when even a syllable won't fit.
 */
const CLUE_TEXT = "wrap-anywhere hyphens-auto";

function Rung({
  n,
  state,
  tight = false,
  children,
}: {
  n: number;
  state: "past" | "current";
  /** No room under it: the keyboard is up and the field follows (AC-DLY-32). */
  tight?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      data-rung={state}
      className={cx(
        "relative grid grid-cols-[1.875rem_minmax(0,1fr)] items-start gap-x-2.5",
        tight ? "pt-1" : "py-1",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "absolute top-[2.125rem] -bottom-1 left-[calc(0.9375rem-1px)] w-0.5",
          // Forced colours drop fills and gradients: the rail becomes a border.
          state === "past"
            ? "bg-[color:var(--kn-ink,var(--foreground))] forced-colors:bg-[color:CanvasText] forced-colors:forced-color-adjust-none"
            : "bg-[repeating-linear-gradient(var(--kn-rule-strong,color-mix(in_oklab,var(--foreground)_40%,transparent))_0_4px,transparent_4px_8px)] forced-colors:border-l-2 forced-colors:border-dashed forced-colors:border-[color:CanvasText]",
        )}
      />
      <span
        aria-hidden="true"
        className={cx(
          "relative z-[1] grid size-[1.875rem] place-items-center rounded-full border-2 text-[0.9375rem] leading-none font-bold transition-colors duration-150",
          DISPLAY_FONT,
          state === "past" &&
            cx(
              "border-[color:var(--kn-ink-3,var(--muted-foreground))]",
              TONE.sunken,
              TONE.ink2,
            ),
          state === "current" &&
            cx(
              TONE.inkFill,
              TONE.inkBorder,
              "forced-colors:bg-[color:CanvasText] forced-colors:text-[color:Canvas] forced-colors:forced-color-adjust-none",
            ),
        )}
      >
        {n}
      </span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

export function ClueLadder({
  open,
  firstClue,
  firstGuesses,
  reducedMotion,
  compact,
  optionsShowing,
  clueHeadingRef,
  headingIsFocusTarget,
  note = null,
}: ClueLadderProps) {
  return (
    <ol aria-label={MYSTERY_COPY.ladder.label} className="flex flex-col">
      {open.clues.map((text, i) => {
        const n = i + 1;
        const current = n === open.clue;
        const stamps = open.wrongGuesses
          .map((guess, order) => ({ guess, order }))
          .filter(({ guess }) => guess.clue === n);
        const arrived = n > firstClue;
        return (
          <Rung
            key={n}
            n={n}
            state={current ? "current" : "past"}
            tight={current && compact}
          >
            {current ? (
              <div
                data-clue-card=""
                className={cx(
                  "relative min-w-0 rounded-[14px] border-[1.5px] outline-offset-[3px] has-[h2:focus-visible]:outline-[3px] has-[h2:focus-visible]:outline-[color:var(--kn-focus,var(--foreground))]",
                  // With the keyboard up the card slims, so the field and
                  // three rows fit under it (AC-DLY-32).
                  compact ? "px-3 py-1.5" : "px-3.5 pt-3 pb-3",
                  TONE.inkBorder,
                  TONE.surface,
                  TONE.ledge,
                  arrived && enter("clue", reducedMotion),
                )}
              >
                {compact ? null : (
                  <span
                    aria-hidden="true"
                    className={cx(
                      "absolute -top-2.5 right-3 rounded-full px-2 text-xs leading-[1.35] font-extrabold shadow-[0_0_0_3px_var(--kn-page,var(--background))] forced-colors:border forced-colors:border-[color:CanvasText]",
                      TONE.accentFill,
                      arrived && enter("tag", reducedMotion),
                    )}
                  >
                    {n === 4
                      ? MYSTERY_COPY.ladder.lastTag
                      : MYSTERY_COPY.ladder.newTag}
                  </span>
                )}
                <h2
                  ref={clueHeadingRef}
                  tabIndex={-1}
                  {...focusTargetProps(
                    headingIsFocusTarget ? "clue_heading" : null,
                  )}
                  className={cx(
                    // The card draws the focus ring (above).
                    "font-semibold text-pretty outline-none",
                    CLUE_TEXT,
                    compact
                      ? "text-[0.9375rem] leading-snug"
                      : "text-lg leading-[1.38]",
                  )}
                >
                  <span className="sr-only">
                    {MYSTERY_COPY.ladder.clue(n)}:
                  </span>{" "}
                  {text}
                </h2>
              </div>
            ) : (
              <p
                className={cx(
                  "pt-1",
                  CLUE_TEXT,
                  optionsShowing || compact
                    ? "text-sm leading-[1.35]"
                    : "text-[0.9375rem] leading-[1.4]",
                  compact && "line-clamp-1",
                  TONE.ink2,
                )}
              >
                <span className="sr-only">{MYSTERY_COPY.ladder.clue(n)}:</span>{" "}
                {text}
              </p>
            )}
            {current && note !== null ? (
              <p
                id={note.id}
                data-clue-note=""
                className={cx(
                  "mt-2 rounded-xl px-3 py-2 text-[0.9375rem] leading-snug font-semibold text-pretty forced-colors:border forced-colors:border-[color:CanvasText]",
                  CLUE_TEXT,
                  TONE.accentTint,
                  TONE.ink,
                )}
              >
                {note.text}
              </p>
            ) : null}
            {stamps.map(({ guess, order }) => (
              <p
                key={guess.entityId}
                data-stamp={guess.entityId}
                className={cx(
                  // Turned about its middle, each end moves under 7 px for a
                  // 300 px stamp: the margins keep it clear of the clue
                  // above and the rung below.
                  "my-2 inline-flex max-w-full -rotate-[2.5deg] items-center gap-1.5 rounded-[7px] border-2 px-2 py-0.5 text-[0.8125rem] leading-[1.3] font-extrabold",
                  TONE.surface,
                  TONE.incorrectBorder,
                  TONE.incorrectText,
                  order >= firstGuesses && enter("stamp", reducedMotion),
                )}
              >
                <CrossIcon size={13} />
                <span className="min-w-0 break-words">
                  {MYSTERY_COPY.ladder.stamp(guess.display)}
                </span>
              </p>
            ))}
          </Rung>
        );
      })}
    </ol>
  );
}
