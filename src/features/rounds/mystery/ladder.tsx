/**
 * The clue ladder (PRD §3.1.4, DESIGN §6.3): a rail down the left past
 * numbered rungs, solid ink up to the current clue and dashed below it.
 *
 * - Past clues sit small and quiet; a wrong guess made on one is stamped
 *   onto it ("× Not Mary Shelley"), rotated like a rubber stamp and never
 *   struck through, so the name stays readable.
 * - The current clue is a card with a "New" tag ("Last clue" on clue 4),
 *   and its heading takes focus after Next clue (DESIGN §6.4).
 * - The next rung holds the Next clue button, which the new clue replaces
 *   in place.
 *
 * Clues and stamps that arrive while the round is on screen animate in
 * (DESIGN §7.4); the ones a reload brings back are simply there.
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
  /** The next rung's content: the Next clue button. */
  slot: ReactNode;
}

function Rung({
  n,
  state,
  children,
}: {
  n: number;
  state: "past" | "current" | "slot";
  children: ReactNode;
}) {
  return (
    <li
      data-rung={state}
      className="relative grid grid-cols-[1.875rem_minmax(0,1fr)] items-start gap-x-2.5 py-1"
    >
      {state === "slot" ? null : (
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
      )}
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
          state === "slot" &&
            cx("border-dashed", TONE.strongBorder, TONE.surface, TONE.ink3),
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
  slot,
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
          <Rung key={n} n={n} state={current ? "current" : "past"}>
            {current ? (
              <div
                data-clue-card=""
                className={cx(
                  "relative rounded-[14px] border-[1.5px]",
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
                    "font-semibold text-pretty outline-offset-4 focus-visible:outline-[3px] focus-visible:outline-[color:var(--kn-focus,var(--foreground))]",
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
            {stamps.map(({ guess, order }) => (
              <p
                key={guess.entityId}
                data-stamp={guess.entityId}
                className={cx(
                  "mt-1.5 inline-flex max-w-full origin-left -rotate-[2.5deg] items-center gap-1.5 rounded-[7px] border-2 px-2 py-0.5 text-[0.8125rem] leading-[1.3] font-extrabold",
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
      {open.clue < 4 && slot !== null ? (
        <Rung n={open.clue + 1} state="slot">
          {slot}
        </Rung>
      ) : null}
    </ol>
  );
}
