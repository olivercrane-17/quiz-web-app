/**
 * Text metrics (ARCHITECTURE §4.12). The build, the content lint and the
 * choice plugin all use these three, so a length or order rule means the
 * same thing everywhere.
 */

/** NFC code points: how CONTENT_GUIDE's character limits count. */
export function charCount(text: string): number {
  let count = 0;
  for (const _ of text.normalize("NFC")) count += 1;
  return count;
}

/** Whitespace-separated tokens on NFC text, numbers included. */
export function wordCount(text: string): number {
  const trimmed = text.normalize("NFC").trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/u).length;
}

/**
 * The sort key of one option:
 * - `era`: a signed year written with an era, "500 BC" is -500, "AD 79" is 79;
 * - `plain`: a bare whole number such as "1912", which reads as a year or as
 *   a count and sorts with either;
 * - `quantity`: a number with its unit, "1,250 km" is 1250 km. Grouping
 *   commas, a decimal point or a sign make a quantity even without a unit.
 */
export type SortKey =
  | { form: "era"; value: number }
  | { form: "plain"; value: number }
  | { form: "quantity"; value: number; unit: string };

export type SortKeyError = "not_numeric" | "mixed_forms" | "mixed_units";

export type SortKeysResult =
  | { ok: true; keys: SortKey[] }
  | { ok: false; error: SortKeyError; index: number };

const DIGITS = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;
const ERA = new RegExp(
  String.raw`^(?:(AD|CE) ?)?${DIGITS} ?(BCE|BC|AD|CE)?$`,
  "i",
);
const PLAIN = /^\d+$/;
/** A unit never starts with a digit, a separator or a sign, so "1,25 km" is not "1". */
const QUANTITY = new RegExp(
  String.raw`^([-−])?${DIGITS}(?:\.(\d+))?(?:\s*([^\d\s.,\-−](?:.*\S)?))?$`,
  "u",
);
const ORDINAL = /^(?:st|nd|rd|th)$/i;

function toNumber(digits: string): number {
  return Number(digits.replace(/,/g, ""));
}

export function sortKey(option: string): SortKey | null {
  const text = option.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (text === "") return null;
  if (PLAIN.test(text)) return { form: "plain", value: Number(text) };
  const era = ERA.exec(text);
  if (era) {
    const [, prefix, digits = "", suffix] = era;
    // One era marker, before or after the number, never both.
    if (prefix !== undefined && suffix !== undefined) return null;
    if (prefix !== undefined || suffix !== undefined) {
      const bc = suffix !== undefined && /^BCE?$/i.test(suffix);
      const year = toNumber(digits);
      return { form: "era", value: bc ? -year : year };
    }
  }
  const quantity = QUANTITY.exec(text);
  if (!quantity) return null;
  const [, sign, digits = "", fraction, rawUnit = ""] = quantity;
  const magnitude = toNumber(digits) + (fraction ? Number(`0.${fraction}`) : 0);
  const unit = ORDINAL.test(rawUnit) ? "ordinal" : rawUnit;
  return {
    form: "quantity",
    value: sign === undefined ? magnitude : -magnitude,
    unit,
  };
}

/**
 * The keys of one set of options, or the first option that breaks the set:
 * one that is not a number or date, a set mixing era years with quantities
 * (mixed_forms), or quantities in different units (mixed_units). A plain
 * number fits with era years and with unitless quantities.
 */
export function sortKeys(options: readonly string[]): SortKeysResult {
  const keys: SortKey[] = [];
  let era = false;
  let plain = false;
  /** The unit every quantity so far shares, once one has been seen. */
  let unit: string | null = null;
  for (const [index, option] of options.entries()) {
    const key = sortKey(option);
    if (key === null) return { ok: false, error: "not_numeric", index };
    if (key.form === "era") {
      if (unit !== null) return { ok: false, error: "mixed_forms", index };
      era = true;
    } else if (key.form === "plain") {
      if (unit !== null && unit !== "")
        return { ok: false, error: "mixed_units", index };
      plain = true;
    } else {
      if (era) return { ok: false, error: "mixed_forms", index };
      if ((unit !== null && unit !== key.unit) || (plain && key.unit !== ""))
        return { ok: false, error: "mixed_units", index };
      unit = key.unit;
    }
    keys.push(key);
  }
  return { ok: true, keys };
}

/**
 * Display order for `order: 'ascending'` options: indices sorted by key,
 * equal keys keeping source order. Null when the set can't be sorted.
 */
export function ascendingOrder(options: readonly string[]): number[] | null {
  const result = sortKeys(options);
  if (!result.ok) return null;
  return result.keys
    .map((key, index) => ({ value: key.value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index)
    .map((entry) => entry.index);
}
