/**
 * The Encore's number line (PRD §3.1.5, DESIGN §6.5): the last beat of
 * every Daily, drawn as well as written.
 *
 * A ratio scale from half the answer to double it (for years, 20 years
 * either side), with the close band and the bullseye band shaded around
 * the answer, marks for the guess, the answer and (once crowd stats
 * qualify) the crowd's median. On the reveal a needle eases from the guess
 * to the answer; under reduced motion it is a static drawing. Both marks
 * are labelled (R1-26): "You" over the guess and "Answer" with its value
 * under the answer, between the two ends' values. A guess beyond either
 * end sits at the edge with an arrow, and its label gives its value there
 * ("You 300 m →"), since the line can't show where it really lies. Screen
 * readers get the same facts as text (AC-DLY-35).
 *
 * Every mark is a box with a fill, which forced colours would paint as
 * Canvas. There the line keeps its own system colours instead
 * (`forced-color-adjust: none`): the track, the answer and the needle in
 * CanvasText, the guess in Highlight, the close band as a dashed outline
 * and the bullseye band as a solid one (DESIGN §11).
 */
import type { CSSProperties } from "react";

import { formatEncoreAmount, numberLineGeometry } from "@/engine/encore";
import { cx } from "@/ui/cx";

import { DISPLAY_FONT, TONE } from "../mystery/tones";
import { ENCORE_COPY, bandWords } from "./copy";

export interface NumberLineProps {
  valueKind: "quantity" | "year";
  guess: number;
  answer: number;
  /** The crowd's median, only once crowd stats qualify. */
  median: number | null;
  bands: { bullseye: number; close: number };
  unitShort: string;
  decimals: 0 | 1 | 2;
  reducedMotion: boolean;
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

/** A value the line labels, rounded to the Encore's decimals. */
function amount(
  value: number,
  props: Pick<NumberLineProps, "unitShort" | "valueKind" | "decimals">,
): string {
  const factor = 10 ** props.decimals;
  const rounded = Math.round(value * factor) / factor;
  return formatEncoreAmount(rounded, props.unitShort, props.valueKind);
}

function Arrow({ edge }: { edge: "low" | "high" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 10"
      width={10}
      height={10}
      data-edge-arrow=""
      className={cx(
        // Ink: it sits on the card beside the dot, not on the dot's fill.
        "absolute top-1/2 -translate-y-1/2 fill-current forced-colors:text-[color:CanvasText]",
        TONE.ink,
        edge === "high" ? "left-full ml-0.5" : "right-full mr-0.5 rotate-180",
      )}
    >
      <path d="M1 1 9 5 1 9Z" />
    </svg>
  );
}

export function NumberLine(props: NumberLineProps) {
  const { valueKind, guess, answer, median, bands, reducedMotion } = props;
  const line = numberLineGeometry({ valueKind, guess, answer, median, bands });
  const label = ENCORE_COPY.numberLine.text({
    guess: amount(guess, props),
    answer: amount(answer, props),
    median: median === null ? null : amount(median, props),
    bullseye: bandWords(bands.bullseye, valueKind),
    close: bandWords(bands.close, valueKind),
  });
  const needle = {
    "--from": pct(line.guess.at),
    "--to": pct(line.answer),
  } as CSSProperties;
  const words = ENCORE_COPY.numberLine;
  const edge = line.guess.edge;
  const guessLabel =
    edge === "high"
      ? words.offHigh(amount(guess, props))
      : edge === "low"
        ? words.offLow(amount(guess, props))
        : words.you;
  // The label sits over its mark, and turns to stay inside near an end.
  const guessAlign =
    edge === "high" || (edge === null && line.guess.at > 0.9)
      ? "-translate-x-full"
      : edge === "low" || line.guess.at < 0.1
        ? "translate-x-0"
        : "-translate-x-1/2";

  return (
    <figure
      role="img"
      aria-label={label}
      data-number-line={line.scale}
      data-motion={reducedMotion ? "reduce" : undefined}
      className="mt-3"
    >
      <div
        aria-hidden="true"
        className="relative mx-3 h-[1.125rem] text-xs leading-none font-extrabold"
      >
        <span
          data-label="guess"
          style={{ left: pct(line.guess.at) }}
          className={cx(
            "absolute bottom-0 whitespace-nowrap tabular-nums",
            guessAlign,
            TONE.ink,
          )}
        >
          {guessLabel}
        </span>
      </div>
      <div className="relative mx-3 h-11">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-[21px] h-0.5 bg-[color:var(--kn-rule-strong,color-mix(in_oklab,var(--foreground)_45%,transparent))] forced-colors:bg-[color:CanvasText] forced-colors:forced-color-adjust-none"
        />
        <span
          data-band="close"
          style={{
            left: pct(line.close.from),
            width: pct(line.close.to - line.close.from),
          }}
          className="absolute top-3.5 h-4 rounded-[3px] bg-[color:color-mix(in_oklab,var(--kn-correct-tint,var(--muted))_55%,transparent)] forced-colors:border-[1.5px] forced-colors:border-dashed forced-colors:border-[color:CanvasText] forced-colors:bg-[color:Canvas] forced-colors:forced-color-adjust-none"
        />
        <span
          data-band="bullseye"
          style={{
            left: pct(line.bullseye.from),
            width: pct(line.bullseye.to - line.bullseye.from),
          }}
          className={cx(
            "absolute top-3.5 h-4 rounded-[3px] shadow-[inset_0_0_0_1.5px_var(--kn-correct-line,var(--foreground))] forced-colors:border-2 forced-colors:border-[color:CanvasText] forced-colors:bg-[color:Canvas] forced-colors:shadow-none forced-colors:forced-color-adjust-none",
            TONE.correctTint,
          )}
        />
        {line.median === null ? null : (
          <span
            data-mark="median"
            data-edge={line.median.edge ?? undefined}
            style={{ left: pct(line.median.at) }}
            className={cx(
              "absolute top-2 h-7 w-0 -translate-x-1/2 border-l-2 border-dashed forced-colors:border-[color:CanvasText]",
              TONE.strongBorder,
            )}
          />
        )}
        <span
          data-mark="answer"
          style={{ left: pct(line.answer) }}
          className="absolute top-1.5 h-8 w-[3px] -translate-x-1/2 rounded-sm bg-[color:var(--kn-ink,var(--foreground))] forced-colors:bg-[color:CanvasText] forced-colors:forced-color-adjust-none"
        />
        {/* The needle travels from the guess to the answer as the result lands. */}
        <span
          data-mark="needle"
          aria-hidden="true"
          style={needle}
          className={cx(
            "absolute top-0 left-[var(--to)] h-11 w-0.5 -translate-x-1/2 bg-[color:var(--kn-ink,var(--foreground))] opacity-60 forced-colors:bg-[color:CanvasText] forced-colors:forced-color-adjust-none",
            !reducedMotion &&
              "transition-[left] delay-300 duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] starting:left-[var(--from)]",
          )}
        />
        <span
          data-mark="guess"
          data-edge={line.guess.edge ?? undefined}
          style={{ left: pct(line.guess.at) }}
          className={cx(
            "absolute top-[15px] size-3 -translate-x-1/2 rounded-full shadow-[0_0_0_2px_var(--kn-surface,var(--background)),inset_0_0_0_2px_var(--kn-chart-you-line,var(--foreground))] forced-colors:border-2 forced-colors:border-[color:CanvasText] forced-colors:bg-[color:Highlight] forced-colors:text-[color:CanvasText] forced-colors:shadow-none forced-colors:forced-color-adjust-none",
            TONE.accentFill,
          )}
        >
          {line.guess.edge === null ? null : <Arrow edge={line.guess.edge} />}
        </span>
      </div>
      {/* The ends' values at the sides, the answer's label in the middle,
          under its tick: equal side columns keep the middle centred. */}
      <div
        aria-hidden="true"
        className={cx(
          "mx-3 mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2 text-xs font-semibold tabular-nums",
          DISPLAY_FONT,
          TONE.ink3,
        )}
      >
        <span data-label="low" className="text-left break-words">
          {amount(line.ends.low, props)}
        </span>
        <span
          data-label="answer"
          className={cx("text-center font-extrabold", TONE.ink)}
        >
          {words.answer} {amount(answer, props)}
        </span>
        <span data-label="high" className="text-right break-words">
          {amount(line.ends.high, props)}
        </span>
      </div>
    </figure>
  );
}
