// @vitest-environment node
/**
 * Unit tests for the streak engine's edges that the fixture table leaves
 * implicit: the date-line thresholds, a stored candidate that no longer
 * applies, incident boundaries, the epoch, DST and the ledger's guards.
 */
import { describe, expect, it } from "vitest";

import { startOfLocalDay } from "../time/zone.ts";
import {
  parseLocalDate,
  parseTimeZone,
  type EpochMs,
  type LocalDate,
  type TimeZone,
} from "../types/ids.ts";
import {
  EMPTY_LEDGER,
  applyFinish,
  chainCount,
  datelineAllowed,
  effectiveToday,
  evaluateStreak,
  finishLedger,
  isRepairable,
  lastCreditedDate,
  nextDailyAt,
  readLedger,
  repairCapUntil,
  summarizeStreak,
  type StoredDay,
  type StreakInput,
} from "./index.ts";
import { statusMap } from "./summary.ts";

function d(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (date === null) throw new Error(text);
  return date;
}

function tz(text: string): TimeZone {
  const zone = parseTimeZone(text);
  if (zone === null) throw new Error(text);
  return zone;
}

const at = (text: string): EpochMs => Date.parse(text);
const LONDON = tz("Europe/London");
const KIRITIMATI = tz("Pacific/Kiritimati");
const EPOCH = d("2026-09-21");

function played(from: string, to: string): StoredDay[] {
  const days: StoredDay[] = [];
  for (let day = Date.parse(from); day <= Date.parse(to); day += 86_400_000) {
    days.push({
      date: d(new Date(day).toISOString().slice(0, 10)),
      status: "played",
    });
  }
  return days;
}

function input(overrides: Partial<StreakInput> = {}): StreakInput {
  return {
    now: at("2026-11-11T08:00:00Z"),
    today: d("2026-11-11"),
    dayStart: (date) => startOfLocalDay(date, LONDON),
    offsetMinutes: 0,
    lastFinishOffsetMinutes: 0,
    zone: LONDON,
    lastFinishZone: LONDON,
    datelineCandidate: null,
    datelineUsedAt: null,
    days: played("2026-11-03", "2026-11-09"),
    pending: [],
    freezesHeld: 0,
    freezeProgress: 0,
    lastRepairAt: null,
    incidents: [],
    epoch: EPOCH,
    ...overrides,
  };
}

const eastward = (overrides: Partial<StreakInput> = {}) =>
  input({ zone: KIRITIMATI, offsetMinutes: 840, ...overrides });

describe("the date-line rule's thresholds (PRD §4.4.7)", () => {
  it("needs an offset that grew by 12 hours or more", () => {
    expect(datelineAllowed(eastward({ offsetMinutes: 719 }))).toBe(false);
    expect(datelineAllowed(eastward({ offsetMinutes: 720 }))).toBe(true);
  });

  it("needs a last finish to compare with", () => {
    expect(datelineAllowed(eastward({ lastFinishZone: null }))).toBe(false);
    expect(datelineAllowed(eastward({ lastFinishOffsetMinutes: null }))).toBe(
      false,
    );
  });

  it("takes the cooldown from the input when the tunable changes", () => {
    const usedAt = at("2026-11-01T08:00:00Z");
    expect(datelineAllowed(eastward({ datelineUsedAt: usedAt }))).toBe(false);
    expect(
      datelineAllowed(
        eastward({ datelineUsedAt: usedAt, datelineCooldownDays: 9 }),
      ),
    ).toBe(true);
  });

  it("starts no candidate on a pending date, and takes the next gap date instead", () => {
    const evaluation = evaluateStreak(
      eastward({
        now: at("2026-11-12T08:00:00Z"),
        today: d("2026-11-12"),
        pending: [d("2026-11-10")],
      }),
    );
    expect(evaluation.datelineCandidate).toEqual({
      date: "2026-11-11",
      zone: KIRITIMATI,
    });
    expect(evaluation.written).toEqual([]);
  });

  it("drops a stored candidate whose date was decided some other way, and starts no new one", () => {
    const evaluation = evaluateStreak(
      eastward({
        days: [
          ...played("2026-11-03", "2026-11-09"),
          { date: d("2026-11-10"), status: "freeze" },
        ],
        datelineCandidate: { date: d("2026-11-10"), zone: KIRITIMATI },
      }),
    );
    expect(evaluation.datelineUsed).toBe(false);
    expect(evaluation.datelineCandidate).toBeNull();
    expect(evaluation.written).toEqual([]);
  });

  it("leaves a stored candidate on a still-pending date undecided", () => {
    const evaluation = evaluateStreak(
      eastward({
        pending: [d("2026-11-10")],
        datelineCandidate: { date: d("2026-11-10"), zone: KIRITIMATI },
      }),
    );
    expect(evaluation.datelineUsed).toBe(false);
    expect(evaluation.written).toEqual([]);
  });
});

describe("incident windows", () => {
  const day = (text: string) => startOfLocalDay(d(text), LONDON);

  it("protect a date only when they overlap its local day", () => {
    const touching = [
      { start: day("2026-11-09") + 3_600_000, end: day("2026-11-10") },
      { start: day("2026-11-11"), end: day("2026-11-11") + 600_000 },
    ];
    expect(evaluateStreak(input({ incidents: touching })).written).toEqual([
      { date: "2026-11-10", status: "missed" },
    ]);
    const inside = [{ start: day("2026-11-10"), end: day("2026-11-10") + 1 }];
    expect(evaluateStreak(input({ incidents: inside })).written).toEqual([
      { date: "2026-11-10", status: "protected" },
    ]);
  });
});

describe("summarizeStreak", () => {
  const summary = (days: StoredDay[], overrides = {}) =>
    summarizeStreak({
      now: at("2026-11-11T08:00:00Z"),
      today: d("2026-11-11"),
      dayStart: (date) => startOfLocalDay(date, LONDON),
      days,
      lastRepairAt: null,
      epoch: EPOCH,
      ...overrides,
    });

  it("is all zeros and active for a new player, keeping a stored best", () => {
    expect(summary([], { best: 5 })).toEqual({
      current: 0,
      best: 5,
      repair: null,
      repairBlockedUntil: null,
      paused: null,
      display: "active",
      breakTooLong: false,
    });
  });

  it("never reports a best below the stored one", () => {
    expect(summary(played("2026-11-08", "2026-11-10"), { best: 40 }).best).toBe(
      40,
    );
  });

  it("offers no repair for a date before DAILY_EPOCH", () => {
    const days = [
      ...played("2026-09-17", "2026-09-18"),
      { date: d("2026-09-19"), status: "missed" as const },
    ];
    const early = summary(days, {
      now: at("2026-09-20T08:00:00Z"),
      today: d("2026-09-20"),
    });
    expect(early.repair).toBeNull();
    expect(early.display).toBe("broken");
  });

  it("isRepairable refuses dates that aren't Missed, today, and a Missed date with nothing before it", () => {
    const days = [
      { date: d("2026-11-08"), status: "missed" as const },
      ...played("2026-11-09", "2026-11-09"),
      { date: d("2026-11-10"), status: "missed" as const },
    ];
    const base = {
      now: at("2026-11-11T08:00:00Z"),
      today: d("2026-11-11"),
      dayStart: (date: LocalDate) => startOfLocalDay(date, LONDON),
      days,
      lastRepairAt: null,
      epoch: EPOCH,
    };
    expect(isRepairable(base, d("2026-11-10"))).toBe(true);
    expect(isRepairable(base, d("2026-11-09"))).toBe(false);
    expect(isRepairable(base, d("2026-11-08"))).toBe(false);
    expect(
      isRepairable({ ...base, today: d("2026-11-10") }, d("2026-11-10")),
    ).toBe(false);
  });

  it("repairCapUntil reports the cap only while it is closed", () => {
    const repairedAt = at("2026-11-04T10:00:00Z");
    expect(repairCapUntil(at("2026-11-11T09:59:59Z"), repairedAt)).toBe(
      at("2026-11-11T10:00:00Z"),
    );
    expect(repairCapUntil(at("2026-11-11T10:00:00Z"), repairedAt)).toBeNull();
    expect(repairCapUntil(at("2026-11-11T10:00:00Z"), null)).toBeNull();
  });

  it("chainCount stops at a Missed date and counts nothing before the first finish", () => {
    const statuses = statusMap([
      ...played("2026-11-01", "2026-11-02"),
      { date: d("2026-11-03"), status: "missed" },
      ...played("2026-11-04", "2026-11-05"),
      { date: d("2026-11-06"), status: "protected" },
      ...played("2026-11-07", "2026-11-07"),
    ]);
    expect(chainCount(statuses, d("2026-11-07"))).toBe(3);
    expect(chainCount(statuses, d("2026-11-02"))).toBe(2);
    expect(chainCount(statuses, d("2026-10-30"))).toBe(0);
  });
});

describe("effective today and the next Daily (§8.7)", () => {
  it("never moves backward", () => {
    expect(effectiveToday(d("2026-11-10"), d("2026-11-11"))).toBe("2026-11-11");
    expect(effectiveToday(d("2026-11-12"), d("2026-11-11"))).toBe("2026-11-12");
    expect(effectiveToday(d("2026-11-12"), null)).toBe("2026-11-12");
  });

  it("counts to local midnight across a DST change", () => {
    // London leaves summer time at 02:00 on 25 October 2026.
    expect(nextDailyAt(d("2026-10-24"), LONDON)).toBe(
      at("2026-10-24T23:00:00Z"),
    );
    expect(nextDailyAt(d("2026-10-25"), LONDON)).toBe(
      at("2026-10-26T00:00:00Z"),
    );
  });

  it("lastCreditedDate is the latest Played or Repaired date", () => {
    expect(lastCreditedDate([])).toBeNull();
    expect(
      lastCreditedDate([
        { date: d("2026-11-09"), status: "repaired" },
        { date: d("2026-11-08"), status: "played" },
        { date: d("2026-11-10"), status: "missed" },
      ]),
    ).toBe("2026-11-09");
  });
});

describe("the ledger's guards", () => {
  const request = {
    at: at("2026-11-11T08:00:00Z"),
    zone: LONDON,
    epoch: EPOCH,
  };

  it("counts a second on-time finish for an already-played date as other", () => {
    const ledger = {
      ...EMPTY_LEDGER,
      days: played("2026-11-09", "2026-11-11"),
    };
    const finish = finishLedger(ledger, {
      ...request,
      date: d("2026-11-11"),
      play: "on_time",
    });
    expect(finish.kind).toBe("other");
    expect(finish.ledger.dailiesFinished).toBe(0);
  });

  it("serves the effective today and remembers it", () => {
    const read = readLedger(EMPTY_LEDGER, request);
    expect(read.today).toBe("2026-11-11");
    expect(read.ledger.maxServed).toBe("2026-11-11");
    expect(Object.isFrozen(EMPTY_LEDGER)).toBe(true);
  });

  it("applyFinish returns the counters of finishOutcome", () => {
    expect(
      applyFinish(
        { freezesHeld: 0, freezeProgress: 6, dailiesFinished: 6 },
        { date: d("2026-11-11"), kind: "on_time", existing: null },
      ),
    ).toEqual({ freezesHeld: 1, freezeProgress: 0, dailiesFinished: 7 });
  });
});
