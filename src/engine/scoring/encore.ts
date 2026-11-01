/**
 * Encore scoring (ARCHITECTURE §4.6, PRD §4.2.2). The Encore scores no
 * points; its error is the first tiebreaker.
 *
 * - **Error.** For a quantity, the symmetric `max(g, a) / min(g, a) - 1`,
 *   so a guess twice the answer and one half of it are both 1.0 ("100%
 *   off"). For a year, `|g - a|` in years. It is kept as an exact ratio of
 *   two integers (both values scaled by `10^decimals`) and turned into a
 *   float only for `EncoreError.value`.
 * - **Bands.** Bullseye within 5% (or 2 years), close within 15% (or 5
 *   years), overridable per Encore. A value is inside band `b` when
 *   `num × 10,000 <= den × round(b × 10,000)` in `bigint`, the same test SQL
 *   runs in `numeric`, with bands stored to at most 4 decimal places. So 21
 *   against 20 is exactly 5% off and a bullseye, although the float
 *   `21 / 20 - 1` is 0.050000000000000044.
 * - **Display.** "Spot on"; "under 1% off" for any error below 1% that
 *   isn't exact, tested on the exact ratio before rounding, so 0.5% to 0.99%
 *   read "under 1% off" too (PRD §4.2.2); otherwise the whole percent rounded
 *   half up from the exact ratio ("4% off"; 1,045 against 1,000 is "5% off");
 *   "over 999% off" from a rounded 999% (the share token can't carry 999%);
 *   "1 year off", "3 years off".
 */
import type { EncoreBand, EncoreError } from "../types/rounds.ts";
import {
  scaledValue,
  type EncoreDecimals,
  type EncoreValueKind,
} from "../encore/value.ts";

export interface EncoreBands {
  /** A relative error for quantities, whole years for dates. */
  bullseye: number;
  close: number;
}

/**
 * The defaults when an Encore has no `bands` of its own (PRD §4.2.2, memo
 * §2). `src/config/shared.json` carries the same values for SQL; a test in
 * the Encore round checks the two agree.
 */
export const DEFAULT_ENCORE_BANDS: Readonly<
  Record<EncoreValueKind, Readonly<EncoreBands>>
> = Object.freeze({
  quantity: Object.freeze({ bullseye: 0.05, close: 0.15 }),
  year: Object.freeze({ bullseye: 2, close: 5 }),
});

/** An Encore's bands: its own, or the defaults for its kind. */
export function bandsFor(
  valueKind: EncoreValueKind,
  own: EncoreBands | null,
): EncoreBands {
  return own ?? DEFAULT_ENCORE_BANDS[valueKind];
}

/**
 * The exact error: `num / den`. Relative: `(max - min) / min` of the two
 * scaled values. Years: `|g - a|` scaled, over `10^decimals` (1 for whole
 * years).
 */
export interface EncoreRatio {
  kind: EncoreError["kind"];
  num: bigint;
  den: bigint;
}

const TEN_THOUSAND = BigInt(10_000);
const ONE_HUNDRED = BigInt(100);
const TWO = BigInt(2);
const ZERO = BigInt(0);

/** The display at and above this whole percent is "over 999% off". */
export const OVER_PERCENT = 999;

export function encoreRatio(
  valueKind: EncoreValueKind,
  guess: number,
  answer: number,
  decimals: EncoreDecimals,
): EncoreRatio {
  const g = scaledValue(guess, decimals);
  const a = scaledValue(answer, decimals);
  if (valueKind === "year") {
    return {
      kind: "years",
      num: g > a ? g - a : a - g,
      den: BigInt(10) ** BigInt(decimals),
    };
  }
  return g > a
    ? { kind: "relative", num: g - a, den: a }
    : { kind: "relative", num: a - g, den: g };
}

/** True when the error is inside a band of `limit` (a fraction, or years). */
function within(ratio: EncoreRatio, limit: number): boolean {
  const scaledLimit = BigInt(Math.round(limit * 10_000));
  return ratio.num * TEN_THOUSAND <= ratio.den * scaledLimit;
}

export function encoreBand(ratio: EncoreRatio, bands: EncoreBands): EncoreBand {
  if (within(ratio, bands.bullseye)) return "bullseye";
  if (within(ratio, bands.close)) return "close";
  return null;
}

/** The whole percent off, rounded half up from the exact ratio. */
export function encorePercent(ratio: EncoreRatio): number {
  // floor(num × 100 / den + 1/2), all in integers.
  return Number(
    (ratio.num * ONE_HUNDRED * TWO + ratio.den) / (TWO * ratio.den),
  );
}

export function formatEncoreError(ratio: EncoreRatio): string {
  if (ratio.num === ZERO) return "Spot on";
  if (ratio.kind === "years") {
    const years = Number(ratio.num) / Number(ratio.den);
    return years === 1 ? "1 year off" : `${String(years)} years off`;
  }
  // Under 1% but not exact, before any rounding: 1,005 against 1,000 is
  // 0.5% off and reads "under 1% off", where rounding first would say 1%.
  if (ratio.num * ONE_HUNDRED < ratio.den) return "under 1% off";
  const percent = encorePercent(ratio);
  if (percent >= OVER_PERCENT) return "over 999% off";
  return `${String(percent)}% off`;
}

/** The float an EncoreError carries: the relative error, or the years off. */
export function ratioValue(ratio: EncoreRatio): number {
  return Number(ratio.num) / Number(ratio.den);
}

export function encoreError(
  valueKind: EncoreValueKind,
  guess: number,
  answer: number,
  decimals: EncoreDecimals,
): EncoreError {
  const ratio = encoreRatio(valueKind, guess, answer, decimals);
  return {
    kind: ratio.kind,
    value: ratioValue(ratio),
    display: formatEncoreError(ratio),
  };
}

/** Everything an Encore's verdict needs: the error and the band. */
export function judgeEncoreGuess(
  encore: {
    valueKind: EncoreValueKind;
    decimals: EncoreDecimals;
    answer: number;
    bands: EncoreBands | null;
  },
  guess: number,
): { error: EncoreError; band: EncoreBand; ratio: EncoreRatio } {
  const ratio = encoreRatio(
    encore.valueKind,
    guess,
    encore.answer,
    encore.decimals,
  );
  return {
    ratio,
    error: {
      kind: ratio.kind,
      value: ratioValue(ratio),
      display: formatEncoreError(ratio),
    },
    band: encoreBand(ratio, bandsFor(encore.valueKind, encore.bands)),
  };
}
