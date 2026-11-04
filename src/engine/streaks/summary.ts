/**
 * What a player's stored days add up to (PRD §4.4.3 steps 3 to 6, §4.4.4):
 * the chain, the current and best streak, the repair offer, the paused
 * count and the display state. It decides nothing about gap dates, which
 * is `evaluateStreak`'s job; a finish uses it alone for the figures after
 * the finish, so one request never decides a date-line candidate twice.
 *
 * - **Chain.** From a Played or Repaired date back over Played, Repaired,
 *   Freeze, Protected and undecided dates (a pending attempt's date, a
 *   date-line candidate), stopping at a Missed date or before the first
 *   finish. It counts the Played and Repaired dates. An undecided date never
 *   lowers it, as today never does.
 * - **Current.** The chain ending at the latest Played or Repaired date
 *   `L`, or 0 when a date between `L` and today is Missed.
 * - **Best.** The largest chain in the history, never below the stored best.
 * - **Repair** (§4.4.4). A Missed date `M` is repairable when it is the only
 *   Missed date between the Played or Repaired dates around it (or today),
 *   a chain ended before it, the request's local time is before `M + 3`
 *   00:00, the 168-hour cap is open and `M` has a Daily number. The offer
 *   names the latest repairable date, and `paused` holds the chain that
 *   ended before it.
 * - **Display.** `paused` exactly when there is an offer. Otherwise
 *   `broken` once the history holds a Missed date and the current streak is
 *   below the best, so record-first copy leads with the record (PRD §3.4.1:
 *   "Today: day 1 of a new run" reads on the day the new run starts, and
 *   AC-STK-04 checks the stop screen) until the new run reaches the record.
 *   Otherwise `active`.
 * - **breakTooLong.** No offer, and the latest break holds two or more
 *   Missed dates while its last one is still inside the window a single
 *   date would have had: it says why there is no offer now, and stops once
 *   the window would have closed anyway.
 */
import { addDays, dailyNumberFor, daysBetween } from "../time/calendar.ts";
import type { EpochMs, LocalDate } from "../types/ids.ts";
import type { RepairOffer } from "../types/streaks.ts";
import {
  REPAIR_COOLDOWN_MS,
  REPAIR_WINDOW_DAYS,
  type StoredDay,
  type StoredStatus,
  type StreakDisplay,
  type StreakSummary,
} from "./types.ts";

export interface StreakSummaryInput {
  now: EpochMs;
  /** The effective today (§8.7). */
  today: LocalDate;
  /** Local 00:00 of a date in the request's zone. */
  dayStart(date: LocalDate): EpochMs;
  days: readonly StoredDay[];
  lastRepairAt: EpochMs | null;
  epoch: LocalDate;
  /** The stored best; never reported lower. Default 0. */
  best?: number;
}

export type StatusMap = ReadonlyMap<LocalDate, StoredStatus>;

/** Played and Repaired dates earn streak credit. */
export function isCredited(status: StoredStatus | undefined): boolean {
  return status === "played" || status === "repaired";
}

/** The stored statuses by date. A later row for the same date wins. */
export function statusMap(
  days: readonly StoredDay[],
): Map<LocalDate, StoredStatus> {
  const map = new Map<LocalDate, StoredStatus>();
  for (const day of days) map.set(day.date, day.status);
  return map;
}

/** The days as stored rows, oldest first. */
export function sortedDays(statuses: StatusMap): StoredDay[] {
  return [...statuses.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, status]) => ({ date, status }));
}

/** The earliest Played or Repaired date: the first finish. */
export function firstCredited(statuses: StatusMap): LocalDate | null {
  let first: LocalDate | null = null;
  for (const [date, status] of statuses) {
    if (isCredited(status) && (first === null || date < first)) first = date;
  }
  return first;
}

/** The latest Played or Repaired date, optionally strictly before `before`. */
export function latestCredited(
  statuses: StatusMap,
  before?: LocalDate,
): LocalDate | null {
  let latest: LocalDate | null = null;
  for (const [date, status] of statuses) {
    if (!isCredited(status)) continue;
    if (before !== undefined && date >= before) continue;
    if (latest === null || date > latest) latest = date;
  }
  return latest;
}

function earliestCreditedAfter(
  statuses: StatusMap,
  after: LocalDate,
): LocalDate | null {
  let earliest: LocalDate | null = null;
  for (const [date, status] of statuses) {
    if (!isCredited(status) || date <= after) continue;
    if (earliest === null || date < earliest) earliest = date;
  }
  return earliest;
}

/** The Played and Repaired dates in the chain ending at `end`. */
export function chainCount(statuses: StatusMap, end: LocalDate): number {
  const first = firstCredited(statuses);
  if (first === null || end < first) return 0;
  let count = 0;
  for (let date = end; date >= first; date = addDays(date, -1)) {
    const status = statuses.get(date);
    if (status === "missed") break;
    if (isCredited(status)) count += 1;
  }
  return count;
}

/** The largest chain anywhere in the history. */
function longestChain(statuses: StatusMap): number {
  const first = firstCredited(statuses);
  if (first === null) return 0;
  let last = first;
  for (const date of statuses.keys()) if (date > last) last = date;
  let best = 0;
  let run = 0;
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const status = statuses.get(date);
    if (status === "missed") run = 0;
    else if (isCredited(status)) run += 1;
    if (run > best) best = run;
  }
  return best;
}

/** The Missed dates between the credited dates around `date` (or today), `date` included. */
function missedInSpan(
  statuses: StatusMap,
  date: LocalDate,
  today: LocalDate,
): number {
  const before = latestCredited(statuses, date);
  const after = earliestCreditedAfter(statuses, date) ?? today;
  let count = 0;
  for (const [day, status] of statuses) {
    if (status !== "missed" || day >= after) continue;
    if (before !== null && day <= before) continue;
    count += 1;
  }
  return count;
}

/** The end of a repair window: local 00:00 on `date + 3` in the request's zone. */
export function repairDeadline(
  input: Pick<StreakSummaryInput, "dayStart">,
  date: LocalDate,
): EpochMs {
  return input.dayStart(addDays(date, REPAIR_WINDOW_DAYS));
}

/** When the 168-hour cap opens again, while it is closed; else null. */
export function repairCapUntil(
  now: EpochMs,
  lastRepairAt: EpochMs | null,
): EpochMs | null {
  if (lastRepairAt === null) return null;
  const until = lastRepairAt + REPAIR_COOLDOWN_MS;
  return now < until ? until : null;
}

/**
 * Older dates can never be inside a repair window: the request zone's
 * local date trails the effective today by at most 2 days (UTC+14 against
 * UTC-12), so a window that closes at `M + 3` 00:00 reaches back to
 * today - 4 at most. The bound keeps long histories cheap.
 */
const REPAIR_LOOKBACK_DAYS = 7;

function repairableIn(
  input: StreakSummaryInput,
  statuses: StatusMap,
  date: LocalDate,
): boolean {
  if (statuses.get(date) !== "missed" || date >= input.today) return false;
  if (daysBetween(date, input.today) > REPAIR_LOOKBACK_DAYS) return false;
  if (latestCredited(statuses, date) === null) return false;
  if (missedInSpan(statuses, date, input.today) !== 1) return false;
  if (input.now >= repairDeadline(input, date)) return false;
  if (repairCapUntil(input.now, input.lastRepairAt) !== null) return false;
  return dailyNumberFor(date, input.epoch) !== null;
}

/** True when finishing `date` from the archive now would repair the streak (PRD §4.4.4). */
export function isRepairable(
  input: StreakSummaryInput,
  date: LocalDate,
): boolean {
  return repairableIn(input, statusMap(input.days), date);
}

export function summarizeStreak(input: StreakSummaryInput): StreakSummary {
  const statuses = statusMap(input.days);
  const floor = input.best ?? 0;
  const repairBlockedUntil = repairCapUntil(input.now, input.lastRepairAt);
  const latest = latestCredited(statuses);
  if (latest === null) {
    return {
      current: 0,
      best: floor,
      repair: null,
      repairBlockedUntil,
      paused: null,
      display: "active",
      breakTooLong: false,
    };
  }

  let current = chainCount(statuses, latest);
  for (const [date, status] of statuses) {
    if (status === "missed" && date > latest && date < input.today) {
      current = 0;
      break;
    }
  }
  const best = Math.max(floor, longestChain(statuses), current);

  const missed = [...statuses.entries()]
    .filter(([, status]) => status === "missed")
    .map(([date]) => date)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  let repair: RepairOffer | null = null;
  let paused: StreakSummary["paused"] = null;
  for (const date of missed) {
    if (!repairableIn(input, statuses, date)) continue;
    const dailyNumber = dailyNumberFor(date, input.epoch);
    const before = latestCredited(statuses, date);
    if (dailyNumber === null || before === null) continue;
    const until = repairDeadline(input, date);
    repair = { date, dailyNumber, until };
    paused = { streak: chainCount(statuses, before), until };
    break;
  }

  const lastMissed = missed[0];
  const breakTooLong =
    repair === null &&
    lastMissed !== undefined &&
    missedInSpan(statuses, lastMissed, input.today) >= 2 &&
    input.now < repairDeadline(input, lastMissed);

  let display: StreakDisplay = "active";
  if (repair !== null) display = "paused";
  else if (lastMissed !== undefined && current < best) display = "broken";

  return {
    current,
    best,
    repair,
    repairBlockedUntil,
    paused,
    display,
    breakTooLong,
  };
}
