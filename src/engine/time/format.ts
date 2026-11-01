/**
 * Dates for people (PRD §3.0.4): months spelled out, never numeric. English
 * names are written here rather than taken from Intl, so the text never
 * changes with the device's locale data.
 */
import type { LocalDate } from "../types/ids.ts";
import { dateParts, weekdayOf } from "./calendar.ts";

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "Sunday 1 November", or "Sunday 1 November 2026" with the year. */
export function formatLongDate(
  date: LocalDate,
  options: { withYear?: boolean } = {},
): string {
  const [year, month, day] = dateParts(date);
  const text = `${WEEKDAY_NAMES[weekdayOf(date)]} ${day} ${MONTH_NAMES[month - 1]}`;
  return options.withYear === true ? `${text} ${year}` : text;
}
