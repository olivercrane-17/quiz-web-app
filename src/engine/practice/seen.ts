/**
 * Freshness for practice selection (ARCHITECTURE §4.8 step 3, PRD §3.3.1).
 *
 * The seen index stores, per item, the local day it was last seen as a day
 * number (whole days since 1970-01-01, so plain subtraction counts days).
 * Selection prefers items never seen, then items not seen for 60 days or
 * more; only after those come repeats, least recently seen first.
 */
import { DAY_MS, dateParts, utcMidnight } from "../time/calendar.ts";
import type { ItemId, LocalDate } from "../types/ids.ts";
import type { DayNumber, SeenIndex } from "./types.ts";

/** Items seen at least this many days ago count as fresh again. */
export const REPEAT_AFTER_DAYS = 60;

/** 0: never seen; 1: seen 60 or more days ago; 2: a repeat. */
export type FreshnessTier = 0 | 1 | 2;

export function dayNumberOf(date: LocalDate): DayNumber {
  const [year, month, day] = dateParts(date);
  return Math.round(utcMidnight(year, month, day) / DAY_MS);
}

export function freshnessTier(
  id: ItemId,
  seen: SeenIndex,
  today: DayNumber,
): FreshnessTier {
  const last = seen.get(id);
  if (last === undefined) return 0;
  return today - last >= REPEAT_AFTER_DAYS ? 1 : 2;
}
