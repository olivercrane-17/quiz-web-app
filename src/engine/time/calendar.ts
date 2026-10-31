/**
 * Calendar arithmetic on LocalDate strings (ARCHITECTURE §4.3). No zones
 * here: a LocalDate is already a date in some zone, so these work in UTC.
 */
import type { DailyNumber, EpochMs, LocalDate } from "../types/ids.ts";
import { parseDailyNumber, parseLocalDate } from "../types/ids.ts";

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** [year, month 1-12, day] of a LocalDate. */
export function dateParts(date: LocalDate): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year ?? 0, month ?? 0, day ?? 0];
}

/** The instant of 00:00 UTC on that calendar day, for any year. */
export function utcMidnight(year: number, month: number, day: number): EpochMs {
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  at.setUTCHours(0, 0, 0, 0);
  return at.getTime();
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** The UTC calendar date of an instant. */
export function utcDateOf(at: EpochMs): LocalDate {
  const d = new Date(at);
  const text = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
  const date = parseLocalDate(text);
  if (date === null) throw new RangeError(`no calendar date for ${at}`);
  return date;
}

function utcOf(date: LocalDate): EpochMs {
  const [year, month, day] = dateParts(date);
  return utcMidnight(year, month, day);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) {
    throw new RangeError(`addDays needs whole days, got ${days}`);
  }
  const [year, month, day] = dateParts(date);
  return utcDateOf(utcMidnight(year, month, day + days));
}

/** b minus a, in calendar days. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
}

/** 0 for Sunday to 6 for Saturday. */
export function weekdayOf(date: LocalDate): number {
  return new Date(utcOf(date)).getUTCDay();
}

/** `daysBetween(epoch, date) + 1`, or null for a date before the epoch (§4.3). */
export function dailyNumberFor(
  date: LocalDate,
  epoch: LocalDate,
): DailyNumber | null {
  return parseDailyNumber(daysBetween(epoch, date) + 1);
}

/** The date of a Daily number: the inverse of dailyNumberFor. */
export function dateForDailyNumber(
  dailyNumber: DailyNumber,
  epoch: LocalDate,
): LocalDate {
  return addDays(epoch, dailyNumber - 1);
}

export interface GlobalWindow {
  /** `date` 00:00 at UTC+14. */
  opensAt: EpochMs;
  /** `date + 1` 00:00 at UTC-12. */
  closesAt: EpochMs;
}

/**
 * The roughly 50 hours during which `date` is "today" somewhere on Earth
 * (PRD glossary). An attempt's close is computed from its own local date
 * (§8.7).
 */
export function globalWindow(date: LocalDate): GlobalWindow {
  const midnight = utcOf(date);
  return {
    opensAt: midnight - 14 * HOUR_MS,
    closesAt: midnight + DAY_MS + 12 * HOUR_MS,
  };
}

export interface IsoWeek {
  /** Monday. */
  start: LocalDate;
  /** Sunday. */
  end: LocalDate;
}

/** The Monday to Sunday week containing `date` (the Group week tab). */
export function isoWeek(date: LocalDate): IsoWeek {
  const sinceMonday = (weekdayOf(date) + 6) % 7;
  const start = addDays(date, -sinceMonday);
  return { start, end: addDays(start, 6) };
}
