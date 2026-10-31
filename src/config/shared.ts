/**
 * Values the client and SQL must agree on (ARCHITECTURE §5.3), named as the
 * PRD names them. shared.json is the single source: the content build turns
 * it into supabase/seed/config.sql (crowd_min_n, percentile_min_n and so on),
 * the lint reads optionsFromClue from it, and scripts import the JSON file
 * directly. App code reads the validated copy below.
 *
 * `dailyEpoch` is a placeholder until the owner sets the first day of the
 * closed beta (PRD §3.1.2, open question Q2). 21 September 2026 makes the
 * PRD's worked example literal: 1 November 2026 is Daily #42.
 */
import { parseLocalDate, type LocalDate } from "@/engine/types";

import raw from "./shared.json";

export interface EncoreBandValues {
  /** Relative error for quantities, whole years for dates. */
  bullseye: number;
  close: number;
}

export interface SharedConfig {
  dailyEpoch: LocalDate;
  crowdMinN: number;
  percentileMinN: number;
  encoreBands: { quantity: EncoreBandValues; year: EncoreBandValues };
  latencyAllowanceMs: number;
  roundCapMs: number;
  optionsFromClue: 3 | 4;
  honestPlayHiddenMs: number;
  tooFastMs: number;
  dailyMinutes: number;
  blitzSeconds: number;
}

function wholeNumber(value: unknown, name: string, min = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new Error(
      `src/config/shared.json: ${name} must be a whole number >= ${min}`,
    );
  }
  return value;
}

function bands(value: unknown, name: string): EncoreBandValues {
  const record = (value ?? {}) as Record<string, unknown>;
  const bullseye = record.bullseye;
  const close = record.close;
  if (
    typeof bullseye !== "number" ||
    typeof close !== "number" ||
    !(bullseye > 0) ||
    !(bullseye < close)
  ) {
    throw new Error(
      `src/config/shared.json: ${name} needs 0 < bullseye < close`,
    );
  }
  return { bullseye, close };
}

/** Validates shared.json; throws on a bad value, since a wrong one would split client and SQL. */
export function parseSharedConfig(input: unknown): SharedConfig {
  const record = (input ?? {}) as Record<string, unknown>;
  const dailyEpoch = parseLocalDate(record.dailyEpoch);
  if (dailyEpoch === null) {
    throw new Error(
      "src/config/shared.json: dailyEpoch must be a YYYY-MM-DD date",
    );
  }
  const optionsFromClue = record.optionsFromClue;
  if (optionsFromClue !== 3 && optionsFromClue !== 4) {
    throw new Error(
      "src/config/shared.json: optionsFromClue must be 3 or 4 (PRD Q3)",
    );
  }
  const encoreBands = (record.encoreBands ?? {}) as Record<string, unknown>;
  return {
    dailyEpoch,
    crowdMinN: wholeNumber(record.crowdMinN, "crowdMinN", 1),
    percentileMinN: wholeNumber(record.percentileMinN, "percentileMinN", 2),
    encoreBands: {
      quantity: bands(encoreBands.quantity, "encoreBands.quantity"),
      year: bands(encoreBands.year, "encoreBands.year"),
    },
    latencyAllowanceMs: wholeNumber(
      record.latencyAllowanceMs,
      "latencyAllowanceMs",
    ),
    roundCapMs: wholeNumber(record.roundCapMs, "roundCapMs", 1),
    optionsFromClue,
    honestPlayHiddenMs: wholeNumber(
      record.honestPlayHiddenMs,
      "honestPlayHiddenMs",
      1,
    ),
    tooFastMs: wholeNumber(record.tooFastMs, "tooFastMs"),
    dailyMinutes: wholeNumber(record.dailyMinutes, "dailyMinutes", 1),
    blitzSeconds: wholeNumber(record.blitzSeconds, "blitzSeconds", 1),
  };
}

export const SHARED: Readonly<SharedConfig> = Object.freeze(
  parseSharedConfig(raw),
);

/** Daily #1 (PRD §3.1.2). */
export const DAILY_EPOCH: LocalDate = SHARED.dailyEpoch;
