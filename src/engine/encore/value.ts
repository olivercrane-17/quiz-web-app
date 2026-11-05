/**
 * The Encore's number rules (PRD §4.2.1, ARCHITECTURE §4.4.2, §8.8): what
 * a value may be, and its exact decimal digits.
 *
 * A guess is positive, has at most `decimals` digits after the point and at
 * most 15 significant digits, and a year is a whole number from 1 to 9999.
 * The typed-text parser (`parse.ts`) enforces these on what the player
 * types; the judge re-checks the number it receives with `checkEncoreValue`,
 * as `round_judge_encore` does in SQL.
 *
 * Exactness: a number's digits come from its shortest round-trip spelling
 * (`String(value)`), which gives back exactly what was parsed for any value
 * of 15 significant digits or fewer. Scaled by `10^decimals` the digits make
 * an exact `bigint`, which is what the error and band arithmetic of
 * `scoring/encore.ts` works on, so no floating point ever decides a
 * boundary.
 */

export type EncoreValueKind = "quantity" | "year";
export type EncoreDecimals = 0 | 1 | 2;

/** What the parser and the judge need to know about an Encore's number. */
export interface EncoreNumberRules {
  decimals: EncoreDecimals;
  valueKind: EncoreValueKind;
}

/** PRD §4.2.1: "That's more digits than we can take." past this. */
export const ENCORE_MAX_SIGNIFICANT_DIGITS = 15;
export const ENCORE_YEAR_MIN = 1;
export const ENCORE_YEAR_MAX = 9999;

export type EncoreValueError =
  | "not_number"
  | "not_positive"
  | "too_many_decimals"
  | "too_many_digits"
  | "year_range";

/** A positive number's decimal digits: the integer part (no leading zeros) and the fraction (no trailing zeros). */
export interface DecimalDigits {
  int: string;
  frac: string;
}

/**
 * The exact decimal digits of a finite, non-negative number, read from its
 * shortest round-trip spelling, exponent forms ("1e+21", "1.5e-7")
 * included. Null for anything negative or not finite.
 */
export function decimalDigits(value: number): DecimalDigits | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const spelled = String(value);
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(spelled);
  if (match === null) return null;
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? "0");
  // Move the point `exponent` places through the digits.
  const digits = whole + fraction;
  const point = whole.length + exponent;
  let int: string;
  let frac: string;
  if (point <= 0) {
    int = "0";
    frac = "0".repeat(-point) + digits;
  } else if (point >= digits.length) {
    int = digits + "0".repeat(point - digits.length);
    frac = "";
  } else {
    int = digits.slice(0, point);
    frac = digits.slice(point);
  }
  return {
    int: int.replace(/^0+(?=\d)/, ""),
    frac: frac.replace(/0+$/, ""),
  };
}

/** Significant digits: every digit from the first non-zero one on. */
export function significantDigits(int: string, frac: string): number {
  return (int + frac).replace(/^0+/, "").length;
}

/**
 * The value scaled by `10^decimals` as an exact integer, from its digits.
 * The fraction must already fit in `decimals` places.
 */
export function scaleDigits(digits: DecimalDigits, decimals: number): bigint {
  return BigInt(digits.int + digits.frac.padEnd(decimals, "0"));
}

export type EncoreValueCheck =
  | { ok: true; digits: DecimalDigits; scaled: bigint }
  | { ok: false; error: EncoreValueError };

/**
 * The judge's re-check of a number it receives (§8.8): positive, at most
 * `decimals` places, at most 15 significant digits, and for years a whole
 * number from 1 to 9999. On success, the exact digits and the scaled
 * integer.
 */
export function checkEncoreValue(
  value: number,
  rules: EncoreNumberRules,
): EncoreValueCheck {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: "not_number" };
  }
  if (value <= 0) return { ok: false, error: "not_positive" };
  const digits = decimalDigits(value);
  if (digits === null) return { ok: false, error: "not_number" };
  if (
    significantDigits(digits.int, digits.frac) > ENCORE_MAX_SIGNIFICANT_DIGITS
  ) {
    return { ok: false, error: "too_many_digits" };
  }
  if (rules.valueKind === "year") {
    if (
      digits.frac !== "" ||
      value < ENCORE_YEAR_MIN ||
      value > ENCORE_YEAR_MAX
    ) {
      return { ok: false, error: "year_range" };
    }
  }
  if (digits.frac.length > rules.decimals) {
    return { ok: false, error: "too_many_decimals" };
  }
  return { ok: true, digits, scaled: scaleDigits(digits, rules.decimals) };
}

/**
 * A value scaled by `10^decimals` as an exact integer. Throws a RangeError
 * for a value the rules refuse: the plugin checks guesses first, and an
 * answer that fails is a content error the content check would have caught.
 */
export function scaledValue(value: number, decimals: EncoreDecimals): bigint {
  const digits = decimalDigits(value);
  if (digits === null || value <= 0 || digits.frac.length > decimals) {
    throw new RangeError(
      `encore: ${String(value)} is not a positive number with at most ${decimals} decimals`,
    );
  }
  return scaleDigits(digits, decimals);
}
