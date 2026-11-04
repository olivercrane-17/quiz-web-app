/**
 * The Encore's typed input (PRD §4.2.1, ARCHITECTURE §4.4.2).
 *
 * `parseEncoreInput(raw, { decimals, valueKind })` reads what the player
 * typed into the number field:
 *
 * - Digits, spaces and the separators "." and "," only; anything else is
 *   `not_number` ("Numbers only, please."). Spaces of any kind are ignored
 *   (they group digits), and full-width digits, commas and full stops read
 *   as their ASCII forms. Nothing else is folded: superscript, circled or
 *   mathematical digits ("10²", "①②") are `not_number`.
 * - A minus sign (any dash in front) or a value of 0 is `not_positive`
 *   ("Positive numbers only.").
 * - With no decimals allowed, every "." and "," is a thousands separator
 *   and is ignored: "1,250" and "1.250" both mean 1250.
 * - With decimals: when both kinds appear, the last separator is the point
 *   and must be the only one of its kind, and every earlier one is
 *   grouping ("1,250.5" and "1.250,5" both mean 1250.5). When only commas
 *   appear and they group thousands (decision D1, which replaces PRD
 *   §4.2.1's "`1,250` rejected" example), they are ignored: every comma
 *   followed by exactly three digits ("1,200" is 1200, "12,345,678" is
 *   12345678), or Indian grouping, two-digit groups ending in a
 *   three-digit one ("1,20,000" is 120000), after a positive leading
 *   group. Otherwise, when one kind appears, its first occurrence is the
 *   point ("300,5" is 300.5) and any further separator is `bad_separator`
 *   ("Check the dots and commas."); more digits after the point than
 *   allowed is `too_many_decimals` ("Up to 1 decimal place, please."), so
 *   "1,2345" with one decimal still is. D1 names commas only: a dot keeps
 *   its reading as the point. Separators with no digits at all are
 *   `bad_separator` too.
 * - Leading zeros are ignored; at most 15 significant digits
 *   (`too_many_digits`); years are whole numbers from 1 to 9999
 *   (`year_range`).
 *
 * An empty field is `not_number`; the field shows no message until the
 * player types something (PRD §3.1.5, Empty).
 *
 * On success, `preview` is the number as the preview line shows it
 * ("1,250", "1,250.5", "1969"), without the unit.
 */
import { formatEncoreNumber } from "./format.ts";
import {
  ENCORE_MAX_SIGNIFICANT_DIGITS,
  ENCORE_YEAR_MAX,
  ENCORE_YEAR_MIN,
  significantDigits,
  type EncoreNumberRules,
} from "./value.ts";

export type EncoreParseError =
  | "not_number"
  | "not_positive"
  | "bad_separator"
  | "too_many_decimals"
  | "too_many_digits"
  | "year_range";

export type EncoreParseResult =
  | { ok: true; value: number; preview: string }
  | { ok: false; error: EncoreParseError };

/** A leading hyphen-minus, minus sign or dash. */
const LEADING_MINUS = /^[-‐-―−﹘﹣－]/u;
const DIGITS_AND_SEPARATORS = /^[0-9.,]*$/;
/** Full-width digits (U+FF10 to U+FF19), comma (U+FF0C) and full stop (U+FF0E). */
const FULL_WIDTH = /[，．０-９]/gu;
/** A full-width form's distance from its ASCII form. */
const FULL_WIDTH_OFFSET = 0xfee0;

/**
 * Reads a CJK keyboard's full-width digits and separators as ASCII. Only
 * these: whole-string NFKC would also turn "10²" into 102 and "①②" into 12.
 */
function asciiDigits(text: string): string {
  return text.replace(FULL_WIDTH, (char) =>
    String.fromCharCode(char.charCodeAt(0) - FULL_WIDTH_OFFSET),
  );
}

function count(text: string, char: string): number {
  let n = 0;
  for (const c of text) if (c === char) n += 1;
  return n;
}

const fail = (error: EncoreParseError): EncoreParseResult => ({
  ok: false,
  error,
});

const THREE_DIGITS = /^\d{3}$/;
const TWO_DIGITS = /^\d{2}$/;

/**
 * True when the commas of `body` (digits and commas) group thousands (D1):
 * each one followed by exactly three digits, or Indian grouping (two-digit
 * groups ending in a three-digit one), after a leading group that is a
 * positive number. "0,500" and ",500" aren't grouping: a grouped number is
 * 1,000 or more, so they keep the comma as the point.
 */
function commasGroupThousands(body: string): boolean {
  const [lead, ...groups] = body.split(",");
  const last = groups.at(-1);
  if (lead === undefined || last === undefined) return false;
  if (!/^\d*[1-9]\d*$/.test(lead) || !THREE_DIGITS.test(last)) return false;
  const middle = groups.slice(0, -1);
  return (
    middle.every((group) => THREE_DIGITS.test(group)) ||
    middle.every((group) => TWO_DIGITS.test(group))
  );
}

/** Splits the digits into the integer part and the fraction by PRD §4.2.1's separator rules, as D1 amends them. */
function splitAtPoint(
  body: string,
  decimals: number,
): { int: string; frac: string } | EncoreParseError {
  if (decimals === 0) return { int: body.replace(/[.,]/g, ""), frac: "" };
  const dots = count(body, ".");
  const commas = count(body, ",");
  if (dots === 0 && commas === 0) return { int: body, frac: "" };
  // D1: commas that group thousands stay grouping when decimals are allowed.
  if (dots === 0 && commasGroupThousands(body)) {
    return { int: body.replace(/,/g, ""), frac: "" };
  }
  if (dots > 0 && commas > 0) {
    // The last separator is the point and must be the only one of its kind;
    // every earlier separator is then of the other kind, so it is grouping.
    const at = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
    const point = body.charAt(at);
    if (count(body, point) !== 1) return "bad_separator";
    return {
      int: body.slice(0, at).replace(/[.,]/g, ""),
      frac: body.slice(at + 1),
    };
  }
  // One kind: its first occurrence is the point, and it must be the only one.
  const point = dots > 0 ? "." : ",";
  if (count(body, point) > 1) return "bad_separator";
  const at = body.indexOf(point);
  return { int: body.slice(0, at), frac: body.slice(at + 1) };
}

export function parseEncoreInput(
  raw: string,
  rules: EncoreNumberRules,
): EncoreParseResult {
  // Full-width digits and separators read as ASCII; spaces group digits.
  let body = asciiDigits(raw).replace(/\s+/gu, "");
  if (body === "") return fail("not_number");

  const negative = LEADING_MINUS.test(body);
  if (negative) body = body.slice(1);
  if (!DIGITS_AND_SEPARATORS.test(body)) return fail("not_number");
  if (negative) return fail("not_positive");
  if (!/\d/.test(body)) return fail("bad_separator");

  const split = splitAtPoint(body, rules.decimals);
  if (typeof split === "string") return fail(split);
  const { int, frac } = split;
  if (frac.length > rules.decimals) return fail("too_many_decimals");

  const significant = significantDigits(int, frac);
  if (significant === 0) return fail("not_positive");
  if (significant > ENCORE_MAX_SIGNIFICANT_DIGITS) {
    return fail("too_many_digits");
  }

  const whole = int.replace(/^0+(?=\d)/, "") || "0";
  // At most 15 significant digits, so the double round-trips exactly.
  const value = Number(frac === "" ? whole : `${whole}.${frac}`);
  if (
    rules.valueKind === "year" &&
    (frac.replace(/0+$/, "") !== "" ||
      value < ENCORE_YEAR_MIN ||
      value > ENCORE_YEAR_MAX)
  ) {
    return fail("year_range");
  }
  return {
    ok: true,
    value,
    preview: formatEncoreNumber(value, rules.valueKind),
  };
}
