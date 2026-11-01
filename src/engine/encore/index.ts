/**
 * The Encore's number handling (ARCHITECTURE §4.4.2): the typed-input
 * parser, the value rules the judge re-checks, number formatting and the
 * result's number line. Scoring (error, band, display) is in
 * `scoring/encore.ts`; the round plugin in `rounds/encore/`.
 */
export {
  parseEncoreInput,
  type EncoreParseError,
  type EncoreParseResult,
} from "./parse.ts";
export {
  formatEncoreAmount,
  formatEncoreNumber,
  groupThousands,
} from "./format.ts";
export {
  ENCORE_MAX_SIGNIFICANT_DIGITS,
  ENCORE_YEAR_MAX,
  ENCORE_YEAR_MIN,
  checkEncoreValue,
  decimalDigits,
  scaledValue,
  type DecimalDigits,
  type EncoreDecimals,
  type EncoreNumberRules,
  type EncoreValueCheck,
  type EncoreValueError,
  type EncoreValueKind,
} from "./value.ts";
export {
  NUMBER_LINE_YEARS,
  numberLineGeometry,
  type NumberLineGeometry,
  type NumberLineInput,
  type NumberLineMark,
  type NumberLineSpan,
} from "./number-line.ts";
