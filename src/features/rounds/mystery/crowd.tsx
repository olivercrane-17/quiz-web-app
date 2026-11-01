/**
 * How everyone did on a Mystery (PRD §3.1.4, §4.1.5; DESIGN §6.12): five
 * bars, clue 1 to 4 and missed, each with its share above and its label
 * below, the player's own bar hatched and marked "you". The same numbers
 * sit in a visually hidden table, so the chart is never the only way in.
 *
 * Crowd stats exist once `crowd_min_n` eligible runs have resolved the
 * Mystery; before that the server still sends the count, and the card says
 * how many have finished. The most common wrong guess shows when the server
 * sends one (only at 5% or more of eligible wrong guesses).
 */
import { useId } from "react";

import type { MysteryCrowd } from "@/engine/types";
import { cx } from "@/ui/cx";

import { MYSTERY_COPY } from "./copy";
import { DISPLAY_FONT, TONE } from "./tones";

export interface CrowdChartProps {
  crowd: MysteryCrowd | null;
  /** The player's own result, whose bar is marked. */
  solvedOn: 1 | 2 | 3 | 4 | null;
  /** `crowd_min_n` (TUNABLES.crowd.minN). */
  minN: number;
}

export function CrowdChart({ crowd, solvedOn, minN }: CrowdChartProps) {
  const captionId = useId();
  if (crowd === null) return null;
  const copy = MYSTERY_COPY.crowd;
  if (crowd.eligible < minN) {
    return (
      <p className={cx("mt-3 text-[15px]", TONE.ink2)} data-crowd="cold">
        {copy.coldStart(crowd.eligible)}
      </p>
    );
  }
  const bars = [
    ...crowd.solvedOn.map((share, i) => ({
      key: `clue-${String(i + 1)}`,
      label: copy.bar(i + 1),
      short: String(i + 1),
      share,
      you: solvedOn === i + 1,
    })),
    {
      key: "missed",
      label: copy.missed,
      short: copy.missedShort,
      share: crowd.missed,
      you: solvedOn === null,
    },
  ];
  const tallest = Math.max(1, ...bars.map((bar) => bar.share));
  return (
    <figure className="mt-4" data-crowd="chart" aria-labelledby={captionId}>
      <figcaption
        id={captionId}
        className={cx("text-base font-semibold", DISPLAY_FONT)}
      >
        {copy.title}
      </figcaption>
      <div
        aria-hidden="true"
        className="mt-1.5 grid h-[88px] grid-cols-5 items-end gap-2"
      >
        {bars.map((bar) => (
          <div
            key={bar.key}
            data-bar={bar.key}
            data-you={bar.you ? "" : undefined}
            className="grid h-full grid-rows-[auto_1fr_auto] text-center"
          >
            <b className={cx("text-xs font-extrabold", TONE.ink2)}>
              {copy.share(bar.share)}
            </b>
            <span className="flex items-end">
              <i
                style={{
                  height: `${String(Math.max(4, (bar.share / tallest) * 100))}%`,
                }}
                className={cx(
                  "block w-full rounded-t-[3px] rounded-b-[1px]",
                  bar.you
                    ? cx(
                        TONE.chartYou,
                        "shadow-[inset_0_0_0_2px_var(--kn-chart-you-line,var(--foreground))]",
                      )
                    : TONE.chartBar,
                )}
              />
            </span>
            <em
              className={cx(
                "mt-0.5 text-xs font-semibold not-italic",
                DISPLAY_FONT,
                TONE.ink3,
              )}
            >
              {bar.you ? `${bar.short} · ${copy.you}` : bar.short}
            </em>
          </div>
        ))}
      </div>
      {/* A table ignores the 1 px width, so the wrapper does the hiding and clips it. */}
      <div className="sr-only">
        <table>
          <caption>{copy.tableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.column.outcome}</th>
              <th scope="col">{copy.column.share}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.key}>
                <th scope="row">
                  {bar.you ? `${bar.label} (${copy.you})` : bar.label}
                </th>
                <td>{copy.share(bar.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {crowd.topWrongGuess === null ? null : (
        <p className={cx("mt-1.5 text-[13px] font-semibold", TONE.ink2)}>
          {copy.topWrongGuess(crowd.topWrongGuess.display)}
        </p>
      )}
    </figure>
  );
}
