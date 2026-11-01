// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  parseDailyNumber,
  parseLocalDate,
  parseTimeZone,
  type LocalDate,
  type TimeZone,
} from "../types/ids.ts";
import {
  DAY_MS,
  addDays,
  dailyNumberFor,
  dateForDailyNumber,
  daysBetween,
  formatLongDate,
  globalWindow,
  isoWeek,
  localDateOf,
  localDayLengthMs,
  msUntilLocalMidnight,
  startOfLocalDay,
  utcDateOf,
  weekdayOf,
  zoneOffsetMinutes,
} from "./index.ts";

function d(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (date === null) throw new Error(`bad date ${text}`);
  return date;
}
function z(name: string): TimeZone {
  const zone = parseTimeZone(name);
  if (zone === null) throw new Error(`bad zone ${name}`);
  return zone;
}
const t = (iso: string) => Date.parse(iso);
const HOUR = 3_600_000;

const KIRITIMATI = z("Pacific/Kiritimati"); // UTC+14
const MINUS_12 = z("Etc/GMT+12"); // UTC-12 (POSIX signs are inverted)
const LONDON = z("Europe/London");
const NEW_YORK = z("America/New_York");
const UTC = z("UTC");

describe("localDateOf", () => {
  it("reads the date at UTC+14, where every date starts first", () => {
    expect(localDateOf(t("2026-10-31T09:59:59.999Z"), KIRITIMATI)).toBe(
      "2026-10-31",
    );
    expect(localDateOf(t("2026-10-31T10:00:00Z"), KIRITIMATI)).toBe(
      "2026-11-01",
    );
  });

  it("reads the date at UTC-12, where every date ends last", () => {
    expect(localDateOf(t("2026-11-01T11:59:59.999Z"), MINUS_12)).toBe(
      "2026-10-31",
    );
    expect(localDateOf(t("2026-11-01T12:00:00Z"), MINUS_12)).toBe("2026-11-01");
  });

  it("puts one instant on three dates across the zones", () => {
    const at = t("2026-11-01T11:00:00Z");
    expect(localDateOf(at, KIRITIMATI)).toBe("2026-11-02");
    expect(localDateOf(at, UTC)).toBe("2026-11-01");
    expect(localDateOf(at, MINUS_12)).toBe("2026-10-31");
  });

  it("follows a DST change: 23:30 UTC is the next day once BST starts", () => {
    expect(localDateOf(t("2026-03-28T23:30:00Z"), LONDON)).toBe("2026-03-28");
    expect(localDateOf(t("2026-03-29T23:30:00Z"), LONDON)).toBe("2026-03-30");
    expect(localDateOf(t("2026-10-24T23:30:00Z"), LONDON)).toBe("2026-10-25");
    expect(localDateOf(t("2026-10-25T23:30:00Z"), LONDON)).toBe("2026-10-25");
  });

  it("follows a DST change in New York", () => {
    // EDT until 2026-11-01 06:00 UTC, then EST.
    expect(localDateOf(t("2026-11-01T03:59:59Z"), NEW_YORK)).toBe("2026-10-31");
    expect(localDateOf(t("2026-11-01T04:00:00Z"), NEW_YORK)).toBe("2026-11-01");
    expect(localDateOf(t("2026-11-02T04:59:59Z"), NEW_YORK)).toBe("2026-11-01");
    expect(localDateOf(t("2026-11-02T05:00:00Z"), NEW_YORK)).toBe("2026-11-02");
  });
});

describe("zoneOffsetMinutes", () => {
  it.each([
    ["Pacific/Kiritimati", "2026-11-01T00:00:00Z", 840],
    ["Etc/GMT+12", "2026-11-01T00:00:00Z", -720],
    ["Europe/London", "2026-07-01T12:00:00Z", 60],
    ["Europe/London", "2026-12-01T12:00:00Z", 0],
    ["America/New_York", "2026-07-01T12:00:00Z", -240],
    ["America/New_York", "2026-12-01T12:00:00Z", -300],
    ["Asia/Kolkata", "2026-11-01T00:00:00Z", 330],
    ["Asia/Kathmandu", "2026-11-01T00:00:00Z", 345],
  ])("%s at %s is %i", (zone, iso, offset) => {
    expect(zoneOffsetMinutes(t(iso), z(zone))).toBe(offset);
  });

  it("ignores milliseconds and works before 1970", () => {
    expect(zoneOffsetMinutes(t("2026-07-01T12:00:00.987Z"), LONDON)).toBe(60);
    expect(zoneOffsetMinutes(t("1960-07-01T12:00:00Z"), UTC)).toBe(0);
  });
});

describe("startOfLocalDay", () => {
  it("finds local midnight on ordinary days", () => {
    expect(startOfLocalDay(d("2026-11-01"), UTC)).toBe(
      t("2026-11-01T00:00:00Z"),
    );
    expect(startOfLocalDay(d("2026-11-01"), KIRITIMATI)).toBe(
      t("2026-10-31T10:00:00Z"),
    );
    expect(startOfLocalDay(d("2026-11-01"), MINUS_12)).toBe(
      t("2026-11-01T12:00:00Z"),
    );
  });

  it("is safe across DST in London: 23-hour and 25-hour days", () => {
    expect(startOfLocalDay(d("2026-03-29"), LONDON)).toBe(
      t("2026-03-29T00:00:00Z"),
    );
    expect(startOfLocalDay(d("2026-03-30"), LONDON)).toBe(
      t("2026-03-29T23:00:00Z"),
    );
    expect(localDayLengthMs(d("2026-03-29"), LONDON)).toBe(23 * HOUR);
    expect(startOfLocalDay(d("2026-10-25"), LONDON)).toBe(
      t("2026-10-24T23:00:00Z"),
    );
    expect(startOfLocalDay(d("2026-10-26"), LONDON)).toBe(
      t("2026-10-26T00:00:00Z"),
    );
    expect(localDayLengthMs(d("2026-10-25"), LONDON)).toBe(25 * HOUR);
  });

  it("is safe across DST in New York", () => {
    expect(startOfLocalDay(d("2026-11-01"), NEW_YORK)).toBe(
      t("2026-11-01T04:00:00Z"),
    );
    expect(startOfLocalDay(d("2026-11-02"), NEW_YORK)).toBe(
      t("2026-11-02T05:00:00Z"),
    );
    expect(localDayLengthMs(d("2026-03-08"), NEW_YORK)).toBe(23 * HOUR);
  });

  it.each([
    ["Asia/Beirut", "2026-03-29"],
    ["America/Havana", "2026-03-08"],
    ["America/Santiago", "2026-09-06"],
    ["America/Asuncion", "2026-10-04"],
    ["Europe/London", "2026-03-29"],
    ["Australia/Lord_Howe", "2026-10-04"],
    ["Asia/Kathmandu", "2026-11-01"],
  ])(
    "in %s on %s returns the first instant of the local date",
    (zone, date) => {
      const tz = z(zone);
      const start = startOfLocalDay(d(date), tz);
      expect(localDateOf(start, tz)).toBe(date);
      expect(localDateOf(start - 1, tz) < date).toBe(true);
    },
  );

  it("moves to the next existing day when a zone skipped a date entirely", () => {
    // Samoa jumped from 29 to 31 December 2011.
    const apia = z("Pacific/Apia");
    const start = startOfLocalDay(d("2011-12-30"), apia);
    expect(start).toBe(t("2011-12-30T10:00:00Z"));
    expect(localDateOf(start, apia)).toBe("2011-12-31");
    expect(startOfLocalDay(d("2011-12-31"), apia)).toBe(start);
  });
});

describe("msUntilLocalMidnight", () => {
  it("counts to the next local midnight", () => {
    expect(msUntilLocalMidnight(t("2026-11-01T18:30:00Z"), UTC)).toBe(
      5.5 * HOUR,
    );
    expect(msUntilLocalMidnight(t("2026-11-01T00:00:00Z"), UTC)).toBe(DAY_MS);
  });

  it("counts across a DST change", () => {
    // 23:00 BST on the eve of the change: midnight BST is one hour away.
    expect(msUntilLocalMidnight(t("2026-10-24T22:00:00Z"), LONDON)).toBe(HOUR);
    // 01:30 BST on the 25-hour day: midnight GMT is 23.5 hours away.
    expect(msUntilLocalMidnight(t("2026-10-25T00:30:00Z"), LONDON)).toBe(
      23.5 * HOUR,
    );
  });
});

describe("calendar arithmetic", () => {
  it("adds days across months, years and leap days", () => {
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(d("2028-03-01"), -1)).toBe("2028-02-29");
    expect(addDays(d("2026-03-01"), -1)).toBe("2026-02-28");
    expect(addDays(d("2026-11-01"), 0)).toBe("2026-11-01");
    expect(addDays(d("2026-11-01"), 365)).toBe("2027-11-01");
    expect(() => addDays(d("2026-11-01"), 0.5)).toThrow(RangeError);
  });

  it("counts days between dates, in either direction", () => {
    expect(daysBetween(d("2026-01-01"), d("2027-01-01"))).toBe(365);
    expect(daysBetween(d("2028-01-01"), d("2029-01-01"))).toBe(366);
    expect(daysBetween(d("2026-11-01"), d("2026-10-31"))).toBe(-1);
    expect(daysBetween(d("2026-03-28"), d("2026-03-30"))).toBe(2);
  });

  it("names weekdays", () => {
    expect(weekdayOf(d("2026-11-01"))).toBe(0);
    expect(weekdayOf(d("2026-11-02"))).toBe(1);
    expect(weekdayOf(d("2026-12-25"))).toBe(5);
  });

  it("reads the UTC date of an instant", () => {
    expect(utcDateOf(t("2026-11-01T23:59:59.999Z"))).toBe("2026-11-01");
    expect(utcDateOf(t("0099-06-15T00:00:00Z"))).toBe("0099-06-15");
  });
});

describe("dailyNumberFor", () => {
  const epoch = d("2026-09-21");

  it("is 1 on the epoch and counts days after it", () => {
    expect(dailyNumberFor(epoch, epoch)).toBe(1);
    expect(dailyNumberFor(d("2026-11-01"), epoch)).toBe(42);
    expect(dailyNumberFor(d("2027-09-21"), epoch)).toBe(366);
  });

  it("is null before the epoch", () => {
    expect(dailyNumberFor(d("2026-09-20"), epoch)).toBeNull();
    expect(dailyNumberFor(d("2025-01-01"), epoch)).toBeNull();
  });

  it("counts a leap day", () => {
    expect(dailyNumberFor(d("2028-03-01"), d("2028-02-28"))).toBe(3);
  });

  it("round-trips with dateForDailyNumber", () => {
    for (const n of [1, 2, 42, 100, 366, 1000]) {
      const number = parseDailyNumber(n);
      if (number === null) throw new Error("bad number");
      const date = dateForDailyNumber(number, epoch);
      expect(dailyNumberFor(date, epoch)).toBe(n);
    }
    const n42 = parseDailyNumber(42);
    if (n42 === null) throw new Error("bad number");
    expect(dateForDailyNumber(n42, epoch)).toBe("2026-11-01");
  });
});

describe("globalWindow", () => {
  it("opens at 00:00 UTC+14 and closes at 24:00 UTC-12, 50 hours later", () => {
    const span = globalWindow(d("2026-11-01"));
    expect(span.opensAt).toBe(t("2026-10-31T10:00:00Z"));
    expect(span.closesAt).toBe(t("2026-11-02T12:00:00Z"));
    expect(span.closesAt - span.opensAt).toBe(50 * HOUR);
  });

  it("matches the first and the last zone on Earth to reach the date", () => {
    const date = d("2026-11-01");
    const { opensAt, closesAt } = globalWindow(date);
    expect(localDateOf(opensAt - 1, KIRITIMATI)).toBe("2026-10-31");
    expect(localDateOf(opensAt, KIRITIMATI)).toBe(date);
    expect(localDateOf(closesAt - 1, MINUS_12)).toBe(date);
    expect(localDateOf(closesAt, MINUS_12)).toBe("2026-11-02");
  });
});

describe("isoWeek", () => {
  it("runs Monday to Sunday", () => {
    expect(isoWeek(d("2026-11-01"))).toEqual({
      start: "2026-10-26",
      end: "2026-11-01",
    });
    expect(isoWeek(d("2026-11-02"))).toEqual({
      start: "2026-11-02",
      end: "2026-11-08",
    });
    expect(isoWeek(d("2026-12-31"))).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
  });
});

describe("formatLongDate", () => {
  it("spells the month out, with the weekday first", () => {
    expect(formatLongDate(d("2026-11-01"))).toBe("Sunday 1 November");
    expect(formatLongDate(d("2026-12-25"))).toBe("Friday 25 December");
    expect(formatLongDate(d("2026-11-01"), { withYear: true })).toBe(
      "Sunday 1 November 2026",
    );
  });
});
