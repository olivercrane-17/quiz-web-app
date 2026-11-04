/**
 * `evaluateStreak` (ARCHITECTURE §4.11, PRD §4.4.3 to §4.4.7): one pure
 * function, run on every streak read and every finish, giving the answer a
 * nightly job would. The mock backend uses it as its server, and SQL's
 * `private.evaluate_streak` replays the same fixture table
 * (`src/engine/fixtures/streaks.json`).
 *
 * The walk visits every date from the first finish to today - 1 that holds
 * no stored status, in order. In the usual case those are the gap dates
 * `L + 1 .. today - 1`; walking the whole history also decides a date left
 * behind `L`, such as a pending attempt's date whose window closed after a
 * later Daily was played. For each such date:
 *
 * 1. A date holding an open ranked attempt (`pending`) stays undecided,
 *    like today, until its attempt finishes or its window closes.
 * 2. **Protected** when an incident overlaps its local day,
 *    `[dayStart(D), dayStart(D + 1))`. The `protected` notice is written
 *    only while a streak is alive, because its copy says the streak is safe.
 * 3. **Date-line candidate** (PRD §4.4.7): the first gap date this walk
 *    decides after `L`, when the offset grew by 12 hours or more since the
 *    last finish, the zone name differs from the last finish's, and the
 *    rule last protected a date more than 30 days ago. It stays undecided
 *    and spends nothing. The next request decides it: the same zone
 *    protects it (no notice, since the only protected copy names an outage
 *    of ours), another zone walks it like any other gap date. A request
 *    that decides a stored candidate starts no new one. Zones compare by
 *    `sameZone`, so an alias of a zone (`Asia/Calcutta` for
 *    `Asia/Kolkata`) is that zone, never a new name.
 * 4. **Freeze** while a streak is alive and one is held, with a
 *    `freeze_spent` notice.
 * 5. Otherwise **Missed**, after which no freeze is spent until the next
 *    Played or Repaired date.
 *
 * Everything after the walk (chain, current, best, repair, paused, display)
 * is `summarizeStreak`.
 */
import { DAY_MS, addDays } from "../time/calendar.ts";
import type { LocalDate } from "../types/ids.ts";
import { sameZone } from "./credit.ts";
import {
  firstCredited,
  isCredited,
  latestCredited,
  sortedDays,
  statusMap,
  summarizeStreak,
} from "./summary.ts";
import {
  DATELINE_COOLDOWN_DAYS,
  DATELINE_MIN_GROWTH_MINUTES,
  type DatelineCandidate,
  type GapStatus,
  type StreakEvaluation,
  type StreakInput,
} from "./types.ts";

const byDate = <T extends { date: LocalDate }>(a: T, b: T) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/** True when this request may start a date-line candidate (PRD §4.4.7). */
export function datelineAllowed(input: StreakInput): boolean {
  if (input.lastFinishOffsetMinutes === null || input.lastFinishZone === null) {
    return false;
  }
  if (
    input.offsetMinutes - input.lastFinishOffsetMinutes <
    DATELINE_MIN_GROWTH_MINUTES
  ) {
    return false;
  }
  if (sameZone(input.zone, input.lastFinishZone)) return false;
  const cooldownMs =
    (input.datelineCooldownDays ?? DATELINE_COOLDOWN_DAYS) * DAY_MS;
  return (
    input.datelineUsedAt === null ||
    input.now - input.datelineUsedAt > cooldownMs
  );
}

/** True when an incident window overlaps the local day of `date`. */
function overlapsIncident(input: StreakInput, date: LocalDate): boolean {
  if (input.incidents.length === 0) return false;
  const start = input.dayStart(date);
  const end = input.dayStart(addDays(date, 1));
  return input.incidents.some(
    (incident) => incident.start < end && incident.end > start,
  );
}

export function evaluateStreak(input: StreakInput): StreakEvaluation {
  const statuses = statusMap(input.days);
  const pending = new Set<LocalDate>(input.pending);
  const written: StreakEvaluation["written"] = [];
  const notices: StreakEvaluation["notices"] = [];
  let freezes = input.freezesHeld;
  let datelineUsed = false;
  let candidate: DatelineCandidate | null = null;

  const write = (date: LocalDate, status: GapStatus) => {
    statuses.set(date, status);
    written.push({ date, status });
  };

  // A stored candidate is decided by this request. The same zone protects
  // it; any other zone leaves it to the walk below, which decides it like
  // any gap date.
  const stored = input.datelineCandidate;
  if (
    stored !== null &&
    sameZone(stored.zone, input.zone) &&
    stored.date < input.today &&
    !statuses.has(stored.date) &&
    !pending.has(stored.date)
  ) {
    write(stored.date, "protected");
    datelineUsed = true;
  }

  const first = firstCredited(statuses);
  if (first !== null) {
    const gapStart = latestCredited(statuses);
    const mayStartCandidate = stored === null && datelineAllowed(input);
    let alive = false;
    let firstGapDate = true;
    for (let date = first; date < input.today; date = addDays(date, 1)) {
      const status = statuses.get(date);
      if (status !== undefined) {
        if (isCredited(status)) alive = true;
        else if (status === "missed") alive = false;
        continue;
      }
      if (pending.has(date)) continue;
      const isFirstGapDate =
        firstGapDate && gapStart !== null && date > gapStart;
      if (isFirstGapDate) firstGapDate = false;
      if (overlapsIncident(input, date)) {
        write(date, "protected");
        if (alive) notices.push({ kind: "protected", date });
        continue;
      }
      if (isFirstGapDate && mayStartCandidate) {
        candidate = { date, zone: input.zone };
        continue;
      }
      if (alive && freezes > 0) {
        freezes = freezes === 2 ? 1 : 0;
        write(date, "freeze");
        notices.push({ kind: "freeze_spent", date });
        continue;
      }
      write(date, "missed");
      alive = false;
    }
  }

  const summary = summarizeStreak({
    now: input.now,
    today: input.today,
    dayStart: input.dayStart,
    days: sortedDays(statuses),
    lastRepairAt: input.lastRepairAt,
    epoch: input.epoch,
    best: input.best,
  });

  return {
    ...summary,
    written: written.sort(byDate),
    freezesHeld: freezes,
    datelineUsed,
    datelineCandidate: candidate,
    notices: notices.sort(byDate),
  };
}
