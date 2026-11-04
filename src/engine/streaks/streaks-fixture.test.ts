// @vitest-environment node
/**
 * Replays src/engine/fixtures/streaks.json (ARCHITECTURE §4.13): memo §14.1's
 * credit rule, applyFinish on its own, and every scenario as a sequence of
 * streak reads and finishes through the ledger, which runs evaluateStreak,
 * applyFinish and summarizeStreak in the order SQL does. SQL-6 generates its
 * parity tests from the same rows.
 */
import { describe, expect, it } from "vitest";

import table from "../fixtures/streaks.json";
import { addDays } from "../time/calendar.ts";
import {
  parseLocalDate,
  parseTimeZone,
  type EpochMs,
  type LocalDate,
  type TimeZone,
} from "../types/ids.ts";
import { dailyCredit, nextDailyAt } from "./credit.ts";
import { finishOutcome } from "./finish.ts";
import {
  EMPTY_LEDGER,
  finishLedger,
  readLedger,
  type LedgerFinish,
  type LedgerRead,
  type StreakLedger,
} from "./ledger.ts";
import type {
  FinishKind,
  GapStatus,
  StoredStatus,
  StreakEvaluation,
  StreakSummary,
} from "./types.ts";

interface RawStart {
  days?: { from: string; to?: string; status: string }[];
  freezesHeld?: number;
  freezeProgress?: number;
  dailiesFinished?: number;
  best?: number;
  lastRepairAt?: string | null;
  lastFinish?: { zone: string; offsetMinutes: number } | null;
  datelineCandidate?: { date: string; zone: string } | null;
  datelineUsedAt?: string | null;
  maxServed?: string | null;
}

interface RawStep {
  do: string;
  at: string;
  zone: string;
  date?: string;
  play?: string;
  /** An on-time finish's `attempts.streak_credit`, decided as it started; true unless given. */
  streakCredit?: boolean;
  pending?: string[];
  incidents?: { start: string; end: string }[];
  expect?: Record<string, unknown>;
}

interface RawScenario {
  id: string;
  ac?: string;
  title: string;
  start: RawStart;
  steps: RawStep[];
}

interface RawFinishRow {
  id: string;
  ac?: string;
  title: string;
  counters: {
    freezesHeld: number;
    freezeProgress: number;
    dailiesFinished: number;
  };
  finish: { date: string; kind: string; existing: string | null };
  expect: Record<string, unknown>;
}

interface RawCreditRow {
  id: string;
  title: string;
  date: string;
  utcToday: string;
  lastCredited: string | null;
  zone: string;
  previousDailyZone: string | null;
  expect: Record<string, unknown>;
}

const EPOCH = localDate(table.epoch);
const SCENARIOS = table.scenarios as unknown as RawScenario[];
const FINISHES = table.finish as unknown as RawFinishRow[];
const CREDITS = table.credit as unknown as RawCreditRow[];

function localDate(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (date === null) throw new Error(`bad date ${text}`);
  return date;
}

function timeZone(text: string): TimeZone {
  const zone = parseTimeZone(text);
  if (zone === null) throw new Error(`bad zone ${text}`);
  return zone;
}

function instant(text: string): EpochMs {
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) throw new Error(`bad instant ${text}`);
  return ms;
}

const iso = (ms: EpochMs) => new Date(ms).toISOString().replace(".000Z", "Z");
const isoOrNull = (ms: EpochMs | null) => (ms === null ? null : iso(ms));

const held = (count: number): 0 | 1 | 2 =>
  count === 2 ? 2 : count === 1 ? 1 : 0;

function startLedger(start: RawStart): StreakLedger {
  const days: StreakLedger["days"] = [];
  for (const range of start.days ?? []) {
    const last = localDate(range.to ?? range.from);
    for (let day = localDate(range.from); day <= last; day = addDays(day, 1)) {
      days.push({ date: day, status: range.status as StoredStatus });
    }
  }
  return {
    ...EMPTY_LEDGER,
    days,
    freezesHeld: held(start.freezesHeld ?? 0),
    freezeProgress: start.freezeProgress ?? 0,
    dailiesFinished: start.dailiesFinished ?? 0,
    best: start.best ?? 0,
    lastRepairAt: start.lastRepairAt ? instant(start.lastRepairAt) : null,
    lastFinish: start.lastFinish
      ? {
          zone: timeZone(start.lastFinish.zone),
          offsetMinutes: start.lastFinish.offsetMinutes,
        }
      : null,
    datelineCandidate: start.datelineCandidate
      ? {
          date: localDate(start.datelineCandidate.date),
          zone: timeZone(start.datelineCandidate.zone),
        }
      : null,
    datelineUsedAt: start.datelineUsedAt ? instant(start.datelineUsedAt) : null,
    maxServed: start.maxServed ? localDate(start.maxServed) : null,
  };
}

function summaryView(summary: StreakSummary): Record<string, unknown> {
  return {
    current: summary.current,
    best: summary.best,
    storedBest: summary.storedBest,
    display: summary.display,
    repair: summary.repair && {
      date: summary.repair.date,
      dailyNumber: summary.repair.dailyNumber,
      until: iso(summary.repair.until),
    },
    paused: summary.paused && {
      streak: summary.paused.streak,
      until: iso(summary.paused.until),
    },
    repairBlockedUntil: isoOrNull(summary.repairBlockedUntil),
    breakTooLong: summary.breakTooLong,
  };
}

function evaluationView(evaluation: StreakEvaluation): Record<string, unknown> {
  return {
    ...summaryView(evaluation),
    written: evaluation.written,
    freezesHeld: evaluation.freezesHeld,
    datelineUsed: evaluation.datelineUsed,
    datelineCandidate: evaluation.datelineCandidate,
    notices: evaluation.notices,
  };
}

function daysView(
  ledger: StreakLedger,
  wanted: Record<string, unknown>,
): Record<string, unknown> {
  const stored = new Map<string, string>(
    ledger.days.map((day) => [day.date, day.status]),
  );
  return Object.fromEntries(
    Object.keys(wanted).map((day) => [day, stored.get(day) ?? null]),
  );
}

function readStepView(
  read: LedgerRead,
  zone: TimeZone,
  expected: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...evaluationView(read.evaluation),
    today: read.today,
    nextDailyAt: iso(nextDailyAt(read.today, zone)),
    days: daysView(
      read.ledger,
      (expected.days ?? {}) as Record<string, unknown>,
    ),
  };
}

function finishStepView(
  finish: LedgerFinish,
  expected: Record<string, unknown>,
): Record<string, unknown> {
  return {
    kind: finish.kind,
    today: finish.today,
    before: evaluationView(finish.before),
    after: summaryView(finish.after),
    freezesHeld: finish.ledger.freezesHeld,
    freezeProgress: finish.ledger.freezeProgress,
    dailiesFinished: finish.ledger.dailiesFinished,
    freezeEarned: finish.outcome.freezeEarned,
    freezeRefunded: finish.outcome.freezeRefunded,
    days: daysView(
      finish.ledger,
      (expected.days ?? {}) as Record<string, unknown>,
    ),
  };
}

/** Compares only the fields `expected` names; nested before and after compare by field too. */
function expectFields(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  where: string,
): void {
  for (const [key, want] of Object.entries(expected)) {
    if ((key === "before" || key === "after") && want !== null) {
      const nested = actual[key] as Record<string, unknown>;
      for (const [inner, value] of Object.entries(
        want as Record<string, unknown>,
      )) {
        expect(nested[inner], `${where} ${key}.${inner}`).toEqual(value);
      }
      continue;
    }
    expect(actual[key], `${where} ${key}`).toEqual(want);
  }
}

function replay(row: RawScenario): void {
  let ledger = startLedger(row.start);
  row.steps.forEach((step, index) => {
    const where = `${row.id} step ${index + 1} (${step.do} at ${step.at})`;
    const zone = timeZone(step.zone);
    const request = {
      at: instant(step.at),
      zone,
      epoch: EPOCH,
      pending: (step.pending ?? []).map(localDate),
      incidents: (step.incidents ?? []).map((incident) => ({
        start: instant(incident.start),
        end: instant(incident.end),
      })),
    };
    const expected = step.expect ?? {};
    if (step.do === "read") {
      const read = readLedger(ledger, request);
      expectFields(readStepView(read, zone, expected), expected, where);
      ledger = read.ledger;
      return;
    }
    if (step.do !== "finish" || step.date === undefined) {
      throw new Error(`${where}: unknown step`);
    }
    const date = localDate(step.date);
    const finish = finishLedger(
      ledger,
      step.play === "unranked"
        ? { ...request, date, play: "unranked" }
        : {
            ...request,
            date,
            play: "on_time",
            streakCredit: step.streakCredit ?? true,
          },
    );
    expectFields(finishStepView(finish, expected), expected, where);
    ledger = finish.ledger;
  });
}

const titleOf = (row: { id: string; ac?: string; title: string }) =>
  row.ac === undefined
    ? `${row.id}: ${row.title}`
    : `${row.ac} ${row.id}: ${row.title}`;

describe("streaks.json credit (decisions memo §14.1)", () => {
  it.each(CREDITS)("AC-STK-09 $id: $title", (row) => {
    expect(
      dailyCredit({
        date: localDate(row.date),
        utcToday: localDate(row.utcToday),
        lastCredited:
          row.lastCredited === null ? null : localDate(row.lastCredited),
        zone: timeZone(row.zone),
        previousDailyZone:
          row.previousDailyZone === null
            ? null
            : timeZone(row.previousDailyZone),
      }),
    ).toEqual(row.expect);
  });
});

describe("streaks.json finish (applyFinish)", () => {
  it.each(FINISHES.map((row) => [titleOf(row), row] as const))(
    "%s",
    (_, row) => {
      const outcome = finishOutcome(
        {
          freezesHeld: held(row.counters.freezesHeld),
          freezeProgress: row.counters.freezeProgress,
          dailiesFinished: row.counters.dailiesFinished,
        },
        {
          date: localDate(row.finish.date),
          kind: row.finish.kind as FinishKind,
          existing: row.finish.existing as GapStatus | null,
        },
      );
      expect(outcome).toEqual(row.expect);
    },
  );
});

describe("streaks.json scenarios", () => {
  it.each(SCENARIOS.map((row) => [titleOf(row), row] as const))(
    "%s",
    (_, row) => {
      replay(row);
    },
  );

  it("checks the display state in every scenario", () => {
    const missing = SCENARIOS.filter(
      (row) =>
        !row.steps.some((step) => {
          const expected = step.expect ?? {};
          const after = (expected.after ?? {}) as Record<string, unknown>;
          return "display" in expected || "display" in after;
        }),
    ).map((row) => row.id);
    expect(missing).toEqual([]);
  });

  it("covers S1 to S13 of PRD §4.4.8", () => {
    const ids = new Set(SCENARIOS.map((row) => row.id));
    for (let n = 1; n <= 13; n += 1)
      expect(ids.has(`S${n}`), `S${n}`).toBe(true);
  });

  it("uses each id once", () => {
    const ids = [...SCENARIOS, ...FINISHES, ...CREDITS].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
