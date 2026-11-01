/**
 * The Encore result's number line (PRD §3.1.5): where the guess, the answer,
 * the crowd's median and the two bands sit, as fractions of the line's
 * width (0 at the left end, 1 at the right).
 *
 * - Quantities use a ratio scale from half the answer to double it, which
 *   matches how "% off" is measured (§4.2.2): a guess twice the answer and
 *   one half of it sit at the two ends, equally far from the middle.
 * - Years use an even scale, 20 years either side of the answer.
 *
 * The answer always sits in the middle. A band holds every guess whose
 * error is inside it: for quantities from `a / (1 + b)` to `a × (1 + b)`,
 * for years `a ± b`. A mark beyond either end sits at that end with `edge`
 * set, so the line can draw an arrow there.
 */
import type { EncoreValueKind } from "./value.ts";

/** Years shown either side of the answer. */
export const NUMBER_LINE_YEARS = 20;

export interface NumberLineInput {
  valueKind: EncoreValueKind;
  guess: number;
  answer: number;
  /** The crowd's median guess, once crowd stats qualify; else null. */
  median: number | null;
  /** Relative error for quantities, whole years for dates. */
  bands: { bullseye: number; close: number };
}

export interface NumberLineMark {
  /** 0 to 1 across the line. */
  at: number;
  /** Set when the value lies beyond that end, where the mark is pinned. */
  edge: "low" | "high" | null;
}

export interface NumberLineSpan {
  from: number;
  to: number;
}

export interface NumberLineGeometry {
  scale: "ratio" | "years";
  guess: NumberLineMark;
  /** Always the middle. */
  answer: number;
  median: NumberLineMark | null;
  bullseye: NumberLineSpan;
  close: NumberLineSpan;
  /** The values at the two ends: half and double the answer, or 20 years either side. */
  ends: { low: number; high: number };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function mark(at: number): NumberLineMark {
  if (at < 0) return { at: 0, edge: "low" };
  if (at > 1) return { at: 1, edge: "high" };
  return { at, edge: null };
}

function span(halfWidth: number): NumberLineSpan {
  return { from: clamp01(0.5 - halfWidth), to: clamp01(0.5 + halfWidth) };
}

export function numberLineGeometry(input: NumberLineInput): NumberLineGeometry {
  const { answer, guess, median, bands } = input;
  if (input.valueKind === "year") {
    const position = (v: number) =>
      0.5 + (v - answer) / (2 * NUMBER_LINE_YEARS);
    return {
      scale: "years",
      guess: mark(position(guess)),
      answer: 0.5,
      median: median === null ? null : mark(position(median)),
      bullseye: span(bands.bullseye / (2 * NUMBER_LINE_YEARS)),
      close: span(bands.close / (2 * NUMBER_LINE_YEARS)),
      ends: {
        low: answer - NUMBER_LINE_YEARS,
        high: answer + NUMBER_LINE_YEARS,
      },
    };
  }
  // log2(v / a) runs from -1 (half) to 1 (double); halve it into the line.
  const position = (v: number) =>
    v > 0 ? 0.5 + Math.log2(v / answer) / 2 : Number.NEGATIVE_INFINITY;
  return {
    scale: "ratio",
    guess: mark(position(guess)),
    answer: 0.5,
    median: median === null ? null : mark(position(median)),
    bullseye: span(Math.log2(1 + bands.bullseye) / 2),
    close: span(Math.log2(1 + bands.close) / 2),
    ends: { low: answer / 2, high: answer * 2 },
  };
}
