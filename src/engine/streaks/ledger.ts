/**
 * A player's stored streak state and the two requests that change it, in
 * the order SQL runs them (ARCHITECTURE §8.7, §8.10). The fixture table
 * replays its scenarios through these functions, and the mock streaks area
 * (STK-1) can store a `StreakLedger` per player and call them, so the mock,
 * the fixtures and SQL share one sequence of steps:
 *
 * - **A read** (`get_streak`): the effective today from the request's zone
 *   and the latest date served, then `evaluateStreak`, then the decided gap
 *   statuses, the freezes, the best, the date-line candidate and its use
 *   are stored.
 * - **A finish** (the streak hook of `finish_attempt_internal`): the same
 *   evaluation first, with an on-time attempt's own date held pending,
 *   since it is still open at that moment; then the finish kind; then
 *   `applyFinish`, the date's status, `lastRepairAt` for a repair and the
 *   last finish's zone and offset (every finish). The figures after it come
 *   from `summarizeStreak`, so the request never decides anything twice.
 *
 * The kind of a finish: an on-time ranked finish is `on_time` when its date
 * is later than the last credited date (memo §14.1), otherwise `other`. An
 * unranked play (archive, a challenge of that date, or a resumed abandoned
 * attempt) is `repair` when its date is repairable at that moment, the
 * 168-hour cap included, otherwise `other`.
 */
import {
  localDateOf,
  startOfLocalDay,
  zoneOffsetMinutes,
} from "../time/zone.ts";
import type { EpochMs, LocalDate, TimeZone } from "../types/ids.ts";
import { effectiveToday, lastCreditedDate } from "./credit.ts";
import { evaluateStreak } from "./evaluate.ts";
import { finishOutcome, type FinishOutcome } from "./finish.ts";
import {
  isCredited,
  isRepairable,
  sortedDays,
  statusMap,
  summarizeStreak,
  type StreakSummaryInput,
} from "./summary.ts";
import type {
  DatelineCandidate,
  FinishKind,
  GapStatus,
  IncidentWindow,
  StoredDay,
  StreakEvaluation,
  StreakInput,
  StreakSummary,
} from "./types.ts";

export interface StreakLedger {
  /** Stored statuses, oldest first. */
  days: StoredDay[];
  freezesHeld: 0 | 1 | 2;
  freezeProgress: number;
  dailiesFinished: number;
  best: number;
  lastRepairAt: EpochMs | null;
  lastFinish: { zone: TimeZone; offsetMinutes: number } | null;
  datelineCandidate: DatelineCandidate | null;
  datelineUsedAt: EpochMs | null;
  /** The latest local date served (`players.max_local_date`). */
  maxServed: LocalDate | null;
}

export const EMPTY_LEDGER: Readonly<StreakLedger> = Object.freeze({
  days: [],
  freezesHeld: 0,
  freezeProgress: 0,
  dailiesFinished: 0,
  best: 0,
  lastRepairAt: null,
  lastFinish: null,
  datelineCandidate: null,
  datelineUsedAt: null,
  maxServed: null,
});

export interface StreakRequest {
  /** Server time. */
  at: EpochMs;
  /** The request's IANA zone. */
  zone: TimeZone;
  /** DAILY_EPOCH. */
  epoch: LocalDate;
  /** Dates holding an open ranked attempt that can still finish on time. */
  pending?: readonly LocalDate[];
  incidents?: readonly IncidentWindow[];
  datelineCooldownDays?: number;
}

export interface LedgerRead {
  ledger: StreakLedger;
  today: LocalDate;
  evaluation: StreakEvaluation;
}

export interface LedgerFinishRequest extends StreakRequest {
  /** The attempt's local date. */
  date: LocalDate;
  /** `on_time`: a ranked attempt finished inside its window. `unranked`: anything else. */
  play: "on_time" | "unranked";
}

export interface LedgerFinish {
  ledger: StreakLedger;
  today: LocalDate;
  kind: FinishKind;
  /** The evaluation the finish ran first. */
  before: StreakEvaluation;
  /** The figures after the finish. */
  after: StreakSummary;
  outcome: FinishOutcome;
}

function withStatus(
  days: readonly StoredDay[],
  updates: readonly StoredDay[],
): StoredDay[] {
  const statuses = statusMap(days);
  for (const update of updates) statuses.set(update.date, update.status);
  return sortedDays(statuses);
}

function requestToday(ledger: StreakLedger, request: StreakRequest): LocalDate {
  return effectiveToday(
    localDateOf(request.at, request.zone),
    ledger.maxServed,
  );
}

function dayStartIn(zone: TimeZone) {
  return (date: LocalDate) => startOfLocalDay(date, zone);
}

/** A streak read: evaluate, then store what the evaluation decided. */
export function readLedger(
  ledger: StreakLedger,
  request: StreakRequest,
): LedgerRead {
  const today = requestToday(ledger, request);
  const input: StreakInput = {
    now: request.at,
    today,
    dayStart: dayStartIn(request.zone),
    offsetMinutes: zoneOffsetMinutes(request.at, request.zone),
    lastFinishOffsetMinutes: ledger.lastFinish?.offsetMinutes ?? null,
    zone: request.zone,
    lastFinishZone: ledger.lastFinish?.zone ?? null,
    datelineCandidate: ledger.datelineCandidate,
    datelineUsedAt: ledger.datelineUsedAt,
    days: ledger.days,
    pending: request.pending ?? [],
    freezesHeld: ledger.freezesHeld,
    freezeProgress: ledger.freezeProgress,
    lastRepairAt: ledger.lastRepairAt,
    incidents: request.incidents ?? [],
    epoch: request.epoch,
    best: ledger.best,
    datelineCooldownDays: request.datelineCooldownDays,
  };
  const evaluation = evaluateStreak(input);
  return {
    today,
    evaluation,
    ledger: {
      ...ledger,
      days: withStatus(ledger.days, evaluation.written),
      freezesHeld: evaluation.freezesHeld,
      best: evaluation.best,
      datelineCandidate: evaluation.datelineCandidate,
      datelineUsedAt: evaluation.datelineUsed
        ? request.at
        : ledger.datelineUsedAt,
      maxServed: today,
    },
  };
}

/** A finished Daily: evaluate, decide the kind, apply it. */
export function finishLedger(
  ledger: StreakLedger,
  request: LedgerFinishRequest,
): LedgerFinish {
  const today = requestToday(ledger, request);
  const pending =
    request.play === "on_time" && request.date < today
      ? [...(request.pending ?? []), request.date]
      : request.pending;
  const read = readLedger(ledger, { ...request, pending });
  const stored = read.ledger;
  const existingStatus = statusMap(stored.days).get(request.date);

  const summaryInput = (days: readonly StoredDay[]): StreakSummaryInput => ({
    now: request.at,
    today,
    dayStart: dayStartIn(request.zone),
    days,
    lastRepairAt: stored.lastRepairAt,
    epoch: request.epoch,
    best: stored.best,
  });

  let kind: FinishKind = "other";
  if (!isCredited(existingStatus)) {
    if (request.play === "on_time") {
      const last = lastCreditedDate(stored.days);
      if (last === null || request.date > last) kind = "on_time";
    } else if (isRepairable(summaryInput(stored.days), request.date)) {
      kind = "repair";
    }
  }

  const existing: GapStatus | null =
    existingStatus === "freeze" ||
    existingStatus === "protected" ||
    existingStatus === "missed"
      ? existingStatus
      : null;
  const outcome = finishOutcome(
    {
      freezesHeld: stored.freezesHeld,
      freezeProgress: stored.freezeProgress,
      dailiesFinished: stored.dailiesFinished,
    },
    { date: request.date, kind, existing },
  );

  const days =
    outcome.status === null
      ? stored.days
      : withStatus(stored.days, [
          { date: request.date, status: outcome.status },
        ]);
  const lastRepairAt =
    outcome.status === "repaired" ? request.at : stored.lastRepairAt;
  const after = summarizeStreak({ ...summaryInput(days), lastRepairAt });

  return {
    today,
    kind,
    before: read.evaluation,
    after,
    outcome,
    ledger: {
      ...stored,
      ...outcome.counters,
      days,
      best: after.best,
      lastRepairAt,
      lastFinish: {
        zone: request.zone,
        offsetMinutes: zoneOffsetMinutes(request.at, request.zone),
      },
    },
  };
}
