/**
 * The stake indicator (PRD §3.1.4, DESIGN §6.3 worth scale): the values
 * 4 3 2 1 with the current one marked by a disc, the spent ones struck
 * through, and "points now" beneath. Always on screen while a Mystery is
 * open, so the cost of every clue is in plain sight.
 *
 * Screen readers hear it as one image named "Worth 3 points now"
 * (AC-DLY-29), described by "Each clue costs a point: 4, 3, 2, 1." The
 * status region repeats the new worth after each wrong guess or Next clue
 * (the round's announcement copy).
 *
 * When the worth drops, the 4 is struck and the disc slides one step with
 * a small overshoot (DESIGN §7.4); under reduced motion the disc jumps.
 *
 * Steps are 2rem, and 25 px under 360 px wide (DESIGN §10.2): the cells,
 * the disc and its slide share one `--stake-step`. Under forced colours the
 * disc's fill drops out, so a CanvasText ring marks the current value.
 *
 * A mark, never a control (R1-27): the disc is flat, with no ledge, and
 * "points now" follows it, centred under the current value where it fits
 * and held to the scale's edge under the 4 and the 1.
 */
import { useId, type CSSProperties } from "react";

import { cx } from "@/ui/cx";

import { MYSTERY_COPY } from "./copy";
import { DISPLAY_FONT, LABEL_SLIDE, SLIDE, TONE } from "./tones";

const VALUES = [4, 3, 2, 1] as const;

/**
 * Where "points now" sits under the disc at `step` (0 under the 4, 3 under
 * the 1): centred on the disc between the ends, and held to the scale's
 * edge at either end, where a centred label would run past it.
 */
function labelPlacement(step: number): CSSProperties {
  if (step <= 0) return { left: "0%", translate: "0 0" };
  if (step >= 3) return { left: "100%", translate: "-100% 0" };
  return {
    left: `calc(${String(step + 0.5)} * var(--stake-step))`,
    translate: "-50% 0",
  };
}

export interface StakeIndicatorProps {
  /** What a solve now would score: 4 on clue 1, down to 1 on clue 4. */
  worth: number;
  reducedMotion: boolean;
  className?: string;
}

export function StakeIndicator({
  worth,
  reducedMotion,
  className,
}: StakeIndicatorProps) {
  const descriptionId = useId();
  const step = Math.min(3, Math.max(0, 4 - worth));
  return (
    <div
      // The step is the column's, so the label under the scale reads it too.
      className={cx(
        "flex shrink-0 flex-col items-end [--stake-step:2rem] max-[359px]:[--stake-step:1.5625rem]",
        className,
      )}
    >
      <div
        role="img"
        aria-label={MYSTERY_COPY.stake.name(worth)}
        aria-describedby={descriptionId}
        data-stake={worth}
        className="relative flex items-center"
      >
        {/* The disc behind the current value, sliding one step per clue. */}
        <span
          aria-hidden="true"
          data-stake-marker=""
          style={{ translate: `calc(${String(step)} * var(--stake-step)) 0` }}
          className={cx(
            "absolute top-0 left-0 size-[var(--stake-step)] rounded-full forced-colors:border-2 forced-colors:border-[color:CanvasText]",
            TONE.accentFill,
            !reducedMotion && SLIDE,
          )}
        />
        {VALUES.map((value) => {
          const state =
            value > worth ? "spent" : value === worth ? "now" : "ahead";
          return (
            <span
              key={value}
              aria-hidden="true"
              data-value={value}
              data-state={state}
              className={cx(
                "relative z-[1] grid size-[var(--stake-step)] place-items-center leading-none font-bold tabular-nums transition-colors duration-150",
                DISPLAY_FONT,
                // One font size per width each, so no two utilities compete.
                state === "now"
                  ? "text-[1.25rem] text-[color:var(--kn-on-play-accent,var(--background))] max-[359px]:text-[1.0625rem]"
                  : "text-[1.0625rem] max-[359px]:text-[0.9375rem]",
                state === "spent" &&
                  cx(
                    "line-through decoration-[color:var(--kn-ink-2,var(--muted-foreground))] decoration-2",
                    TONE.ink3,
                  ),
                state === "ahead" && TONE.ink3,
              )}
            >
              {value}
            </span>
          );
        })}
      </div>
      {/* Under the disc: in flow for its height, placed by the step. */}
      <span className="relative block h-[1.25em] w-full text-xs leading-tight">
        <span
          aria-hidden="true"
          data-stake-label={worth}
          style={labelPlacement(step)}
          className={cx(
            "absolute top-0 font-bold whitespace-nowrap",
            TONE.ink3,
            !reducedMotion && LABEL_SLIDE,
          )}
        >
          {MYSTERY_COPY.stake.label}
        </span>
      </span>
      {/* Hidden: it serves as the image's description, never as a second reading. */}
      <span id={descriptionId} hidden>
        {MYSTERY_COPY.stake.description}
      </span>
    </div>
  );
}
