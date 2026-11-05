/**
 * Share codes (ARCHITECTURE §4.9, §4.10; PRD §3.5.1, §3.5.3): the `code`
 * of a share link `/s/{number}/{code}`, which encodes only the result the
 * share text shows. Owned by ENG-2.
 *
 * `code = layout + payload`:
 * - `layout` is one base36 character naming the Daily's composition, from
 *   `content/compositions.json` (`a` = `m3e1`). The content layer loads that
 *   file and passes it in through `parseShareLayouts`, since the engine
 *   imports nothing outside itself.
 * - `payload` is a mixed-radix integer in lowercase base36, at most 7
 *   characters, with no leading zero. Least significant digit first: the
 *   archive flag (radix 2); then for each round in layout order a Mystery's
 *   outcome (radix 6: 0 missed, 1 to 4 solved on that clue, 5 voided) and
 *   its category (radix 12, `SHARE_CATEGORIES`), a choice round's outcome
 *   (radix 3: wrong, correct, voided), or the Encore's token (radix 11,001:
 *   0 spot on, 1 under 1% off, 2 to 999 for 1% to 998% off, 1,000 over 999%
 *   off, 1,001 to 10,999 for 1 to 9,999 years off, 11,000 voided) and band
 *   (radix 3: none, close, bullseye).
 *
 * For `m3e1` the largest payload is `2 × 72³ × 11,001 × 3 - 1`, about
 * 2.46 × 10¹⁰, under `36⁷`, so every code matches `^[0-9a-z]{1,8}$`
 * (AC-SHR-03). A composition whose payload can't fit in 7 characters gets
 * no layout: `parseShareLayouts` refuses it, and the content build with it.
 *
 * Codes carry no secret and can be forged; the landing says "Someone
 * scored", so a forged code claims nothing. `decodeShareCode` returns null
 * for anything malformed, including combinations no result can produce (a
 * voided Encore with a band, a spot-on Encore outside the bullseye band),
 * and the landing then shows a generic "Play today's Daily".
 *
 * Both tables here are part of the format and never change: published
 * links decode by them. A new category or round alphabet needs new layout
 * codes, never an edit to these.
 */
import { COMPOSITION_LETTERS } from "../composition.ts";
import type { CategoryId } from "../types/content.ts";
import type { CompositionId } from "../types/daily.ts";
import {
  parseDailyNumber,
  parseShareCode,
  type DailyNumber,
  type ShareCode,
} from "../types/ids.ts";
import type {
  EncoreBand,
  EncoreError,
  RoundOutcome,
  RoundType,
  ShareCell,
} from "../types/rounds.ts";
import { mysteryCells } from "../run/outcome.ts";
import { shareRows, type ShareRow } from "./text.ts";

/** The radix-12 category digit. Fixed forever: old links decode by it. */
export const SHARE_CATEGORIES: readonly CategoryId[] = Object.freeze([
  "geo",
  "hist",
  "sci",
  "nat",
  "film",
  "music",
  "art",
  "book",
  "sport",
  "food",
  "lang",
  "soc",
]);

/** At most this many payload characters, so a whole code fits in 8. */
export const MAX_PAYLOAD_CHARS = 7;

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
const LAYOUT_CODE = /^[0-9a-z]$/;
const CODE_SHAPE = /^[0-9a-z]{2,8}$/;
const ZERO = BigInt(0);
const THIRTY_SIX = BigInt(36);
const PAYLOAD_LIMIT = THIRTY_SIX ** BigInt(MAX_PAYLOAD_CHARS);

/** Encore tokens (radix 11,001). */
export const ENCORE_TOKEN = Object.freeze({
  spotOn: 0,
  underOnePercent: 1,
  overMaxPercent: 1000,
  firstYear: 1001,
  voided: 11_000,
});
const ENCORE_RADIX = 11_001;
const BAND_DIGIT: Readonly<Record<string, number>> = { close: 1, bullseye: 2 };
const BANDS: readonly EncoreBand[] = [null, "close", "bullseye"];

const LETTER_TYPES = new Map<string, RoundType>(
  (Object.entries(COMPOSITION_LETTERS) as [RoundType, string][]).map(
    ([type, letter]) => [letter, type],
  ),
);

type ShareFamily = "mystery" | "choice" | "encore";

function familyOf(type: RoundType): ShareFamily | null {
  if (type === "mystery") return "mystery";
  if (type === "encore") return "encore";
  if (type === "mc" || type === "tf" || type === "comparison") return "choice";
  return null;
}

/**
 * A composition id's round types (`m3e1` is three Mysteries and an Encore),
 * or null when it is malformed or holds a type with no share alphabet
 * (ordering is reserved).
 */
export function compositionRounds(
  composition: CompositionId,
): RoundType[] | null {
  if (!/^(?:[a-z][1-9][0-9]*)+$/.test(composition)) return null;
  const rounds: RoundType[] = [];
  for (const [, letter, count] of composition.matchAll(/([a-z])(\d+)/g)) {
    const type = letter === undefined ? undefined : LETTER_TYPES.get(letter);
    if (type === undefined || familyOf(type) === null) return null;
    const n = Number(count);
    if (n > 64) return null;
    for (let i = 0; i < n; i += 1) rounds.push(type);
  }
  return rounds;
}

function radicesOf(rounds: readonly RoundType[]): bigint[] {
  const radices = [BigInt(2)];
  for (const type of rounds) {
    const family = familyOf(type);
    if (family === "mystery") radices.push(BigInt(6), BigInt(12));
    else if (family === "encore") radices.push(BigInt(ENCORE_RADIX), BigInt(3));
    else radices.push(BigInt(3));
  }
  return radices;
}

/** How many distinct payloads a composition has; null for an unknown one. */
export function payloadCapacity(composition: CompositionId): bigint | null {
  const rounds = compositionRounds(composition);
  if (rounds === null) return null;
  return radicesOf(rounds).reduce((product, radix) => product * radix);
}

/** True when every result of the composition fits in 7 payload characters. */
export function fitsShareCode(composition: CompositionId): boolean {
  const capacity = payloadCapacity(composition);
  return capacity !== null && capacity <= PAYLOAD_LIMIT;
}

export interface ShareLayouts {
  /** Composition id to its layout character. */
  codeOf: ReadonlyMap<CompositionId, string>;
  /** Layout character to its composition id. */
  compositionOf: ReadonlyMap<string, CompositionId>;
}

/**
 * Validates `content/compositions.json` (`{ "layouts": { "m3e1": "a" } }`):
 * every composition parses and fits, every code is one base36 character,
 * and no code is used twice. Throws an Error naming the problem.
 */
export function parseShareLayouts(raw: unknown): ShareLayouts {
  const layouts =
    raw !== null && typeof raw === "object"
      ? (raw as Record<string, unknown>).layouts
      : undefined;
  if (
    layouts === null ||
    typeof layouts !== "object" ||
    Array.isArray(layouts)
  ) {
    throw new Error("compositions.json: expected an object of layouts");
  }
  const codeOf = new Map<CompositionId, string>();
  const compositionOf = new Map<string, CompositionId>();
  for (const [composition, code] of Object.entries(layouts)) {
    if (compositionRounds(composition) === null) {
      throw new Error(
        `compositions.json: ${composition} is not a composition with a share alphabet`,
      );
    }
    if (!fitsShareCode(composition)) {
      throw new Error(
        `compositions.json: ${composition} can't fit its results in ${MAX_PAYLOAD_CHARS} payload characters`,
      );
    }
    if (typeof code !== "string" || !LAYOUT_CODE.test(code)) {
      throw new Error(
        `compositions.json: ${composition} needs one character from 0-9 or a-z`,
      );
    }
    const taken = compositionOf.get(code);
    if (taken !== undefined) {
      throw new Error(
        `compositions.json: ${composition} and ${taken} both use layout ${code}`,
      );
    }
    codeOf.set(composition, code);
    compositionOf.set(code, composition);
  }
  return { codeOf, compositionOf };
}

/** An Encore's display as its token: "4% off" is 5, "3 years off" is 1,003. */
export function encoreTokenOf(error: EncoreError): number {
  const display = error.display;
  if (display === "Spot on") return ENCORE_TOKEN.spotOn;
  if (display === "under 1% off") return ENCORE_TOKEN.underOnePercent;
  if (display === "over 999% off") return ENCORE_TOKEN.overMaxPercent;
  const percent = /^([1-9][0-9]{0,2})% off$/.exec(display);
  if (percent?.[1] !== undefined && Number(percent[1]) <= 998) {
    return Number(percent[1]) + 1;
  }
  const years = /^([1-9][0-9]{0,3}) years? off$/.exec(display);
  if (years?.[1] !== undefined)
    return ENCORE_TOKEN.firstYear - 1 + Number(years[1]);
  // An unexpected display: fall back to the value it was built from.
  if (error.kind === "years") {
    const whole = Math.round(Math.abs(error.value));
    return whole === 0
      ? ENCORE_TOKEN.spotOn
      : ENCORE_TOKEN.firstYear - 1 + Math.min(whole, 9999);
  }
  if (error.value === 0) return ENCORE_TOKEN.spotOn;
  const whole = Math.floor(Math.abs(error.value) * 100 + 0.5);
  if (Math.abs(error.value) < 0.01) return ENCORE_TOKEN.underOnePercent;
  return whole >= 999 ? ENCORE_TOKEN.overMaxPercent : whole + 1;
}

/** A token's display, as the Encore result reads it; null for a voided Encore. */
export function encoreTokenDisplay(token: number): string | null {
  if (!Number.isInteger(token) || token < 0 || token > ENCORE_TOKEN.voided) {
    throw new RangeError(`no Encore token ${token}`);
  }
  if (token === ENCORE_TOKEN.voided) return null;
  if (token === ENCORE_TOKEN.spotOn) return "Spot on";
  if (token === ENCORE_TOKEN.underOnePercent) return "under 1% off";
  if (token === ENCORE_TOKEN.overMaxPercent) return "over 999% off";
  if (token < ENCORE_TOKEN.overMaxPercent) return `${token - 1}% off`;
  const years = token - (ENCORE_TOKEN.firstYear - 1);
  return years === 1 ? "1 year off" : `${years} years off`;
}

export interface ShareCodeInput {
  composition: CompositionId;
  archive: boolean;
  /** One outcome per round, in round order. */
  outcomes: readonly RoundOutcome[];
}

function digitsOf(
  input: ShareCodeInput,
  rounds: readonly RoundType[],
): bigint[] {
  if (input.outcomes.length !== rounds.length) {
    throw new RangeError(
      `share code: ${input.composition} has ${rounds.length} rounds, got ${input.outcomes.length} outcomes`,
    );
  }
  const digits = [BigInt(input.archive ? 1 : 0)];
  rounds.forEach((type, index) => {
    const outcome = input.outcomes[index];
    if (outcome === undefined || outcome.family !== familyOf(type)) {
      throw new RangeError(
        `share code: round ${index + 1} of ${input.composition} is ${type}, got ${outcome?.family ?? "nothing"}`,
      );
    }
    if (outcome.family === "mystery") {
      const solved = outcome.voided ? 5 : (outcome.solvedOn ?? 0);
      const category = SHARE_CATEGORIES.indexOf(outcome.category);
      if (category < 0) {
        throw new RangeError(
          `share code: unknown category ${outcome.category}`,
        );
      }
      digits.push(BigInt(solved), BigInt(category));
    } else if (outcome.family === "choice") {
      digits.push(BigInt(outcome.voided ? 2 : outcome.correct ? 1 : 0));
    } else if (outcome.voided || outcome.error === null) {
      digits.push(BigInt(ENCORE_TOKEN.voided), ZERO);
    } else {
      const band = outcome.band === null ? 0 : (BAND_DIGIT[outcome.band] ?? 0);
      digits.push(BigInt(encoreTokenOf(outcome.error)), BigInt(band));
    }
  });
  return digits;
}

function toBase36(value: bigint): string {
  if (value === ZERO) return "0";
  let out = "";
  let rest = value;
  while (rest > ZERO) {
    out = `${BASE36[Number(rest % THIRTY_SIX)] ?? ""}${out}`;
    rest /= THIRTY_SIX;
  }
  return out;
}

function fromBase36(text: string): bigint | null {
  let value = ZERO;
  for (const char of text) {
    const digit = BASE36.indexOf(char);
    if (digit < 0) return null;
    value = value * THIRTY_SIX + BigInt(digit);
  }
  return value;
}

/** The share code of a finished result. Throws for a composition with no layout or outcomes that don't match it. */
export function encodeShareCode(
  input: ShareCodeInput,
  layouts: ShareLayouts,
): ShareCode {
  const layout = layouts.codeOf.get(input.composition);
  const rounds = compositionRounds(input.composition);
  if (layout === undefined || rounds === null) {
    throw new RangeError(`share code: no layout for ${input.composition}`);
  }
  const radices = radicesOf(rounds);
  let value = ZERO;
  let place = BigInt(1);
  digitsOf(input, rounds).forEach((digit, index) => {
    const radix = radices[index] ?? BigInt(1);
    value += digit * place;
    place *= radix;
  });
  const code = parseShareCode(`${layout}${toBase36(value)}`);
  if (code === null) throw new RangeError("share code: does not fit");
  return code;
}

/** The share link's path: `/s/{number}/{code}`, with no query or fragment. */
export function sharePath(dailyNumber: DailyNumber, code: ShareCode): string {
  return `/s/${String(dailyNumber)}/${code}`;
}

export type DecodedRound =
  | {
      family: "mystery";
      solvedOn: 1 | 2 | 3 | 4 | null;
      voided: boolean;
      category: CategoryId;
      points: number;
      cells: ShareCell[];
    }
  | {
      family: "choice";
      type: "mc" | "tf" | "comparison";
      correct: boolean;
      voided: boolean;
      points: number;
      cells: ShareCell[];
    }
  | {
      family: "encore";
      token: number;
      display: string | null;
      band: EncoreBand;
      voided: boolean;
    };

export interface DecodedShare {
  dailyNumber: DailyNumber;
  layout: string;
  composition: CompositionId;
  archive: boolean;
  rounds: DecodedRound[];
  /** The grid as the share text draws it: one row per Mystery, consecutive choice rounds collapsed. */
  rows: ShareRow[];
  points: number;
  maxPoints: number;
  /** The Encore's token and display; null when voided or when the composition has none. */
  encore: { token: number; display: string; band: EncoreBand } | null;
}

const SOLVED: readonly (1 | 2 | 3 | 4 | null)[] = [null, 1, 2, 3, 4];

function asOutcome(round: DecodedRound): RoundOutcome {
  if (round.family === "mystery") {
    return {
      family: "mystery",
      solvedOn: round.solvedOn,
      points: round.points,
      voided: round.voided,
      category: round.category,
      cells: round.cells,
    };
  }
  if (round.family === "choice") {
    return {
      family: "choice",
      correct: round.correct,
      points: round.points,
      voided: round.voided,
      answerMs: null,
      cells: round.cells,
    };
  }
  return {
    family: "encore",
    error: null,
    band: round.band,
    voided: round.voided,
  };
}

/** The result a code encodes, or null for anything malformed. */
export function decodeShareCode(
  dailyNumber: number,
  code: string,
  layouts: ShareLayouts,
): DecodedShare | null {
  const number = parseDailyNumber(dailyNumber);
  if (number === null || typeof code !== "string" || !CODE_SHAPE.test(code)) {
    return null;
  }
  const layout = code.charAt(0);
  const payload = code.slice(1);
  const composition = layouts.compositionOf.get(layout);
  if (composition === undefined) return null;
  if (payload.length > 1 && payload.startsWith("0")) return null;
  const rounds = compositionRounds(composition);
  const value = fromBase36(payload);
  if (rounds === null || value === null) return null;
  const radices = radicesOf(rounds);
  const capacity = radices.reduce((product, radix) => product * radix);
  if (value >= capacity) return null;

  let rest = value;
  const next = (index: number): number => {
    const radix = radices[index] ?? BigInt(1);
    const digit = Number(rest % radix);
    rest /= radix;
    return digit;
  };
  let index = 0;
  const archive = next(index++) === 1;
  const decoded: DecodedRound[] = [];
  let points = 0;
  let maxPoints = 0;
  let encore: DecodedShare["encore"] = null;
  for (const type of rounds) {
    const family = familyOf(type);
    if (family === "mystery") {
      const outcome = next(index++);
      const category = SHARE_CATEGORIES[next(index++)];
      if (category === undefined) return null;
      const voided = outcome === 5;
      const solvedOn = voided ? null : (SOLVED[outcome] ?? null);
      const roundPoints = voided ? 4 : solvedOn === null ? 0 : 5 - solvedOn;
      decoded.push({
        family: "mystery",
        solvedOn,
        voided,
        category,
        points: roundPoints,
        cells: voided
          ? ["voided", "voided", "voided", "voided"]
          : mysteryCells(solvedOn),
      });
      points += roundPoints;
      maxPoints += 4;
    } else if (family === "choice") {
      const outcome = next(index++);
      const voided = outcome === 2;
      const correct = outcome === 1;
      const roundPoints = voided || correct ? 1 : 0;
      decoded.push({
        family: "choice",
        type: type as "mc" | "tf" | "comparison",
        correct,
        voided,
        points: roundPoints,
        cells: [voided ? "voided" : correct ? "correct" : "wrong"],
      });
      points += roundPoints;
      maxPoints += 1;
    } else {
      const token = next(index++);
      const band = BANDS[next(index++)] ?? null;
      const voided = token === ENCORE_TOKEN.voided;
      // Combinations no result can produce.
      if (voided && band !== null) return null;
      if (token === ENCORE_TOKEN.spotOn && band !== "bullseye") return null;
      const display = encoreTokenDisplay(token);
      decoded.push({ family: "encore", token, display, band, voided });
      if (!voided && display !== null) encore = { token, display, band };
    }
  }

  return {
    dailyNumber: number,
    layout,
    composition,
    archive,
    rounds: decoded,
    rows: shareRows(decoded.map(asOutcome)),
    points,
    maxPoints,
    encore,
  };
}
