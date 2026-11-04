/**
 * Which local date a request plays, and whether a Daily earns streak credit
 * (decisions memo §14.1, PRD §4.4.1, ARCHITECTURE §8.7).
 *
 * - **Effective today.** The later of the request zone's local date and the
 *   latest date already served, so a move west (or a device set to UTC-12)
 *   can never reopen yesterday as an on-time ranked Daily (AC-STK-07).
 * - **Next Daily.** "Next Daily in" counts to local 00:00, in the request's
 *   zone, of the day after the effective today. After a westward move that
 *   is later than the zone's own next midnight.
 * - **Memo §14.1, which replaces AC-STK-09's 20-hour rule.** A Daily for
 *   local date D is accepted only when D is within one day of the server's
 *   UTC date (D in [utc_today - 1, utc_today + 1]). It earns streak credit
 *   only when D is later than the player's last credited Daily date (the
 *   latest Played or Repaired date), so no device clock or zone change can
 *   backfill a missed day; freezes and free repair exist for that. A run
 *   whose device zone changed since the player's previous Daily stays out
 *   of the crowd's numbers (honest-play flag 16, `scoring/percentile.ts`)
 *   but still earns credit. There is no 20-hour rule.
 */
import { addDays, daysBetween } from "../time/calendar.ts";
import { startOfLocalDay } from "../time/zone.ts";
import type { EpochMs, LocalDate, TimeZone } from "../types/ids.ts";
import { isCredited } from "./summary.ts";
import type { StoredDay } from "./types.ts";

/** The later of the request's local date and the latest date already served. */
export function effectiveToday(
  requestDate: LocalDate,
  maxServed: LocalDate | null,
): LocalDate {
  return maxServed !== null && maxServed > requestDate
    ? maxServed
    : requestDate;
}

/** When the next Daily unlocks: 00:00 of the day after `today`, in `zone`. */
export function nextDailyAt(today: LocalDate, zone: TimeZone): EpochMs {
  return startOfLocalDay(addDays(today, 1), zone);
}

/** The latest Played or Repaired date: the last credited Daily. */
export function lastCreditedDate(days: readonly StoredDay[]): LocalDate | null {
  let latest: LocalDate | null = null;
  for (const day of days) {
    if (isCredited(day.status) && (latest === null || day.date > latest)) {
      latest = day.date;
    }
  }
  return latest;
}

export interface DailyCreditInput {
  /** The local date the Daily belongs to: the date it started on. */
  date: LocalDate;
  /** The server's UTC date when it started. */
  utcToday: LocalDate;
  /** The latest Played or Repaired date, or null before the first finish. */
  lastCredited: LocalDate | null;
  /** The device zone it started in. */
  zone: TimeZone;
  /** The zone the player's previous Daily started in, or null for a first Daily. */
  previousDailyZone: TimeZone | null;
}

export interface DailyCredit {
  /** D is within one day of the server's UTC date. */
  accepted: boolean;
  /** Accepted, and D is later than the last credited date. */
  streakCredit: boolean;
  /** The zone differs from the previous Daily's: kept out of the crowd's numbers. */
  zoneChanged: boolean;
}

/** Memo §14.1, exactly (AC-STK-09). */
export function dailyCredit(input: DailyCreditInput): DailyCredit {
  const offset = daysBetween(input.utcToday, input.date);
  const accepted = offset >= -1 && offset <= 1;
  return {
    accepted,
    streakCredit:
      accepted &&
      (input.lastCredited === null || input.date > input.lastCredited),
    zoneChanged:
      input.previousDailyZone !== null &&
      input.zone !== input.previousDailyZone,
  };
}
