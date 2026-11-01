/**
 * How the Encore writes numbers (PRD §4.2.1, §4.2.2): quantities with
 * thousands grouping ("1,250", "1,250.5"), years as plain digits ("1969"),
 * and either one followed by the unit's short form ("1,250 km").
 *
 * Built from the number's exact digits (`value.ts`), never from
 * locale-dependent formatting, so the preview, the reveal and the share
 * text read the same on every device. Grouping is in the field's preview,
 * never in the field itself, so the caret never jumps (DESIGN §6.5).
 */
import { decimalDigits, type EncoreValueKind } from "./value.ts";

/** "1250" is "1,250"; "1234567" is "1,234,567". */
export function groupThousands(int: string): string {
  return int.replace(/\B(?=(?:\d{3})+(?!\d))/g, ",");
}

/**
 * The number as the Encore shows it: grouped for quantities, plain for
 * years, with as many decimals as it has (at most the two an Encore
 * allows). Anything that isn't a finite positive number is spelled as is.
 */
export function formatEncoreNumber(
  value: number,
  valueKind: EncoreValueKind,
): string {
  const digits = decimalDigits(value);
  if (digits === null) return String(value);
  if (valueKind === "year") {
    return digits.frac === "" ? digits.int : `${digits.int}.${digits.frac}`;
  }
  const int = groupThousands(digits.int);
  return digits.frac === "" ? int : `${int}.${digits.frac}`;
}

/** The number with its unit's short form: "1,250 km", "212 steps", or "1969" for a year. */
export function formatEncoreAmount(
  value: number,
  unitShort: string,
  valueKind: EncoreValueKind,
): string {
  const number = formatEncoreNumber(value, valueKind);
  return unitShort === "" ? number : `${number} ${unitShort}`;
}
