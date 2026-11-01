"use client";

/**
 * The Mystery reveal card (PRD §3.1.4, DESIGN §6.3, §7.4, §12.2). It
 * replaces the clue screen when the round resolves:
 *
 * - Solved: "Knew it." stamped in ("Got it." for a pick among the four
 *   options), "Solved on clue 2 · +3" with the points counting up, and the
 *   answer in large type.
 * - Missed: "This one got away.", "The answer was Heat (1995) · 0 points",
 *   and no celebration.
 *
 * Then all four clues (the solving one marked "Solved here", clues where a
 * guess was made "You guessed ...", the rest "Not needed"), the
 * explanation, the sources line when the item has source labels, the crowd
 * chart, Learn more, the heart and report actions, and Continue. Focus
 * lands on the answer heading (AC-DLY-18), and Enter there continues (PRD
 * §3.0.3), so the keyboard never has to tab past the actions.
 */
import { useEffect, useRef } from "react";

import { TUNABLES } from "@/config/tunables";
import type { MysteryOpen, MysteryReveal } from "@/engine/rounds/mystery";
import type { RoundMeta, RunMode } from "@/engine/types";
import { analyticsMode } from "@/features/analytics/track";
import { RevealActions } from "@/features/reports/reveal-actions";
import { HAPTICS, vibrate } from "@/platform/haptics";
import { playEffect } from "@/platform/sound";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { CrossIcon } from "@/ui/icons";

import type { PlaySettings } from "../contracts";
import { MYSTERY_COPY } from "./copy";
import { CrowdChart } from "./crowd";
import { continueOnEnter, focusTargetProps } from "./focus";
import { ArrowRightIcon, TickIcon } from "./icons";
import { RoundKicker } from "./kicker";
import {
  LearnMoreLink,
  SourcesLine,
  useCountUp,
  useFocusOnMount,
} from "./reveal-parts";
import { DISPLAY_FONT, TONE, enter } from "./tones";

export interface MysteryRevealCardProps {
  meta: RoundMeta;
  reveal: MysteryReveal;
  /** The clue screen the player last saw, when the device still has it: its guesses and option labels. */
  lastOpen: MysteryOpen | null;
  continueLabel: string;
  onContinue(): void;
  itemRef: string;
  mode: RunMode;
  settings: PlaySettings;
}

type ClueRow =
  { state: "solved" } | { state: "used"; tags: string[] } | { state: "spare" };

function clueRows(
  reveal: MysteryReveal,
  lastOpen: MysteryOpen | null,
): ClueRow[] {
  const guesses = lastOpen?.wrongGuesses ?? [];
  const picked =
    reveal.pickedOption === null
      ? null
      : (lastOpen?.options?.find((o) => o.index === reveal.pickedOption)
          ?.label ?? null);
  return reveal.clues.map((_, i) => {
    const n = i + 1;
    if (reveal.solvedOn === n) return { state: "solved" };
    if (reveal.solvedOn !== null && n > reveal.solvedOn) {
      return { state: "spare" };
    }
    const tags = guesses
      .filter((g) => g.clue === n)
      .map((g) => MYSTERY_COPY.reveal.youGuessed(g.display));
    // A miss ends on a wrong pick on the last clue.
    if (reveal.solvedOn === null && n === 4 && picked !== null) {
      tags.push(MYSTERY_COPY.reveal.youPicked(picked));
    }
    return { state: "used", tags };
  });
}

export function MysteryRevealCard({
  meta,
  reveal,
  lastOpen,
  continueLabel,
  onContinue,
  itemRef,
  mode,
  settings,
}: MysteryRevealCardProps) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const solved = reveal.solvedOn !== null;
  const shownPoints = useCountUp(reveal.points, settings.reducedMotion);
  const rows = clueRows(reveal, lastOpen);
  const copy = MYSTERY_COPY.reveal;

  // One cue per reveal, as it lands.
  const cued = useRef(false);
  const { sound, haptics } = settings;
  useEffect(() => {
    if (cued.current) return;
    cued.current = true;
    if (sound) {
      if (solved) {
        playEffect("mystery_solved", {
          points: Math.min(4, Math.max(1, reveal.points)) as 1 | 2 | 3 | 4,
        });
      } else {
        playEffect("wrong");
      }
    }
    if (haptics) vibrate(solved ? HAPTICS.correct : HAPTICS.wrong);
  }, [sound, haptics, solved, reveal.points]);

  return (
    <section
      data-reveal="mystery"
      data-solved-on={reveal.solvedOn ?? "missed"}
      onKeyDown={continueOnEnter(onContinue)}
      className={cx(
        "flex flex-col py-2",
        enter("card", settings.reducedMotion),
      )}
    >
      <RoundKicker meta={meta} withCategory />

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {solved ? (
          <span
            data-verdict="solved"
            className={cx(
              "inline-flex -rotate-3 items-center gap-1.5 rounded-[9px] border-[2.5px] py-0.5 pr-3 pl-2 text-xl font-bold",
              DISPLAY_FONT,
              TONE.surface,
              TONE.correctBorder,
              TONE.correctText,
              enter("verdict", settings.reducedMotion),
            )}
          >
            <TickIcon size={18} strokeWidth={3} />
            {reveal.pickedOption === null ? copy.solved : copy.picked}
          </span>
        ) : (
          <span
            data-verdict="missed"
            className={cx("text-lg font-bold", DISPLAY_FONT)}
          >
            {copy.missed}
          </span>
        )}
        <span className={cx("text-[0.9375rem] font-bold", TONE.ink2)}>
          {solved && reveal.solvedOn !== null ? (
            <>
              {copy.solvedOn(reveal.solvedOn)} ·{" "}
              <span
                aria-hidden="true"
                className={cx("text-lg tabular-nums", DISPLAY_FONT, TONE.ink)}
              >
                +{shownPoints}
              </span>
              <span className="sr-only">{copy.points(reveal.points)}</span>
            </>
          ) : (
            copy.points(0)
          )}
        </span>
      </div>

      {solved ? null : (
        <p className={cx("mt-3 text-sm font-semibold", TONE.ink3)}>
          {copy.answerWas}
        </p>
      )}
      <h1
        ref={headingRef}
        tabIndex={-1}
        {...focusTargetProps("reveal_heading")}
        className={cx(
          "text-[clamp(1.625rem,7.7vw,1.875rem)] leading-[1.02] font-bold tracking-[-0.02em] text-balance outline-none",
          solved ? "mt-2.5" : "mt-0.5",
          DISPLAY_FONT,
        )}
      >
        {reveal.answer.display}
      </h1>

      <ol aria-label={copy.clues} className="mt-3 flex flex-col gap-1.5">
        {reveal.clues.map((text, i) => {
          const row = rows[i] ?? { state: "used", tags: [] };
          return (
            <li
              key={i}
              data-clue-state={row.state}
              className={cx(
                "grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2 rounded-xl py-[7px] pr-2.5 pl-2 text-sm leading-[1.35]",
                row.state === "solved" &&
                  cx(
                    TONE.correctTint,
                    "shadow-[inset_0_0_0_1.5px_var(--kn-correct-line,var(--foreground))]",
                    // Forced colours drop the tint and the inset line: a
                    // double border marks the solving clue (DESIGN §11).
                    "forced-colors:border-[3px] forced-colors:border-double forced-colors:border-[color:CanvasText]",
                  ),
                row.state === "used" &&
                  cx(
                    TONE.surface,
                    "shadow-[inset_0_0_0_1px_var(--kn-rule,var(--border))] forced-colors:border forced-colors:border-[color:CanvasText]",
                  ),
                row.state === "spare" &&
                  cx(
                    "border-[1.5px] border-dashed",
                    TONE.strongBorder,
                    TONE.ink2,
                  ),
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "grid size-6 place-items-center rounded-full border-[1.5px] text-[0.8125rem] font-bold",
                  DISPLAY_FONT,
                  row.state === "solved"
                    ? cx(TONE.correctFill, TONE.correctBorder)
                    : cx(
                        "border-[color:var(--kn-ink-3,var(--muted-foreground))]",
                        TONE.ink2,
                      ),
                )}
              >
                {i + 1}
              </span>
              <p>
                <span className="sr-only">
                  {MYSTERY_COPY.ladder.clue(i + 1)}:
                </span>{" "}
                {text}{" "}
                {row.state === "solved" ? (
                  <span
                    className={cx(
                      "ml-1 inline-flex items-center gap-1 text-xs font-extrabold whitespace-nowrap",
                      TONE.correctText,
                    )}
                  >
                    <TickIcon size={12} strokeWidth={3} />
                    {copy.solvedHere}
                  </span>
                ) : row.state === "spare" ? (
                  <span
                    className={cx(
                      "ml-1 text-xs font-extrabold whitespace-nowrap",
                      TONE.ink3,
                    )}
                  >
                    {copy.notNeeded}
                  </span>
                ) : (
                  row.tags.map((tag) => (
                    <span
                      key={tag}
                      className={cx(
                        "ml-1 inline-flex items-center gap-1 text-xs font-extrabold",
                        TONE.ink3,
                      )}
                    >
                      <CrossIcon size={11} />
                      {tag}
                    </span>
                  ))
                )}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-base leading-normal text-pretty">
        {reveal.explanation}
      </p>
      <SourcesLine labels={reveal.sourceLabels} format={copy.sources} />

      <CrowdChart
        crowd={reveal.crowd}
        solvedOn={reveal.solvedOn}
        minN={TUNABLES.crowd.minN}
      />

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <RevealActions
          itemRef={itemRef}
          mode={analyticsMode(mode)}
          round="mystery"
          wrongGuesses={lastOpen?.wrongGuesses ?? []}
        />
        <LearnMoreLink name={reveal.learnMore} />
      </div>

      <Button
        variant="primary"
        block
        onClick={onContinue}
        className="mt-4"
        data-continue=""
      >
        {continueLabel}
        <ArrowRightIcon size={20} />
      </Button>
    </section>
  );
}
