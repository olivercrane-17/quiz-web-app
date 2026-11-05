/**
 * Instants and local dates in a named zone (ARCHITECTURE §4.3).
 *
 * Dates come from Intl's formatToParts, reading the year, month and day
 * parts by type. A formatted string is never parsed, because its layout has
 * shifted between ICU releases. Intl is allowed in the engine: its output
 * depends only on its arguments (and the tz database it ships with).
 */
import type { EpochMs, LocalDate, TimeZone } from "../types/ids.ts";
import { parseLocalDate } from "../types/ids.ts";
import { addDays, dateParts, utcMidnight } from "./calendar.ts";

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const wallFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(tz: TimeZone): Intl.DateTimeFormat {
  let format = dateFormats.get(tz);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormats.set(tz, format);
  }
  return format;
}

function wallFormat(tz: TimeZone): Intl.DateTimeFormat {
  let format = wallFormats.get(tz);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    wallFormats.set(tz, format);
  }
  return format;
}

type PartName = "year" | "month" | "day" | "hour" | "minute" | "second";

function readParts(
  format: Intl.DateTimeFormat,
  at: EpochMs,
): Partial<Record<PartName, number>> {
  const out: Partial<Record<PartName, number>> = {};
  for (const part of format.formatToParts(at)) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      out[part.type] = Number(part.value);
    }
  }
  return out;
}

/** The YYYY-MM-DD date of instant `at` in zone `tz`. */
export function localDateOf(at: EpochMs, tz: TimeZone): LocalDate {
  const { year, month, day } = readParts(dateFormat(tz), at);
  const date = parseLocalDate(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
  if (date === null) {
    throw new RangeError(`no local date for ${at} in ${tz}`);
  }
  return date;
}

/** The zone's UTC offset at that instant, in minutes (UTC+14 is 840). */
export function zoneOffsetMinutes(at: EpochMs, tz: TimeZone): number {
  const parts = readParts(wallFormat(tz), at);
  const wall =
    utcMidnight(parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1) +
    ((parts.hour ?? 0) % 24) * 3_600_000 +
    (parts.minute ?? 0) * 60_000 +
    (parts.second ?? 0) * 1000;
  const whole = Math.floor(at / 1000) * 1000;
  return Math.round((wall - whole) / 60_000);
}

/**
 * The first instant whose local date in `tz` is `date`: local 00:00, or the
 * first moment after it when a transition skips midnight (some zones start
 * daylight saving at 00:00). Found from the offset, then checked; a binary
 * search covers the cases the offset guess gets wrong.
 */
export function startOfLocalDay(date: LocalDate, tz: TimeZone): EpochMs {
  const [year, month, day] = dateParts(date);
  const base = utcMidnight(year, month, day);
  let guess = base - zoneOffsetMinutes(base, tz) * 60_000;
  guess = base - zoneOffsetMinutes(guess, tz) * 60_000;
  if (localDateOf(guess, tz) === date && localDateOf(guess - 1, tz) < date) {
    return guess;
  }
  // Offsets stay within -12 h and +14 h, so the day starts in this range.
  let before = base - 16 * 3_600_000;
  let after = base + 16 * 3_600_000;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (localDateOf(middle, tz) >= date) after = middle;
    else before = middle;
  }
  return after;
}

/** Countdown source for "Next Daily in": ms from `at` to the next local midnight. */
export function msUntilLocalMidnight(at: EpochMs, tz: TimeZone): number {
  return startOfLocalDay(addDays(localDateOf(at, tz), 1), tz) - at;
}

/** The length of a local day in ms: 23 or 25 hours across a DST change. */
export function localDayLengthMs(date: LocalDate, tz: TimeZone): number {
  return startOfLocalDay(addDays(date, 1), tz) - startOfLocalDay(date, tz);
}
