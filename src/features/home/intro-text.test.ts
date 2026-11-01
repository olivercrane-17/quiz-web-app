import { afterEach, describe, expect, it, vi } from "vitest";

import { MONTH_NAMES, WEEKDAY_NAMES, formatLongDate } from "@/engine/time";
import type { LocalDate } from "@/engine/types";

import { INTRO_IDS, INTRO_WORDS, introScript, introTextAt } from "./intro-text";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("introTextAt", () => {
  it.each([
    [0, "Good evening."],
    [4, "Good evening."],
    [5, "Good morning."],
    [11, "Good morning."],
    [12, "Good afternoon."],
    [17, "Good afternoon."],
    [18, "Good evening."],
    [23, "Good evening."],
  ])("at %i:00 says %s", (hour, greeting) => {
    expect(
      introTextAt(new Date(2026, 9, 31, hour, 0), INTRO_WORDS).greeting,
    ).toBe(greeting);
  });

  it("spells days and months exactly as the engine does", () => {
    expect(INTRO_WORDS.weekdays).toEqual(WEEKDAY_NAMES);
    expect(INTRO_WORDS.months).toEqual(MONTH_NAMES);
    expect(introTextAt(new Date(2026, 10, 1, 9, 0), INTRO_WORDS).date).toBe(
      formatLongDate("2026-11-01" as LocalDate),
    );
  });

  it("writes the date with the weekday and the month spelled out", () => {
    expect(introTextAt(new Date(2026, 9, 31, 9, 0), INTRO_WORDS).date).toBe(
      "Saturday 31 October",
    );
    expect(introTextAt(new Date(2027, 0, 1, 9, 0), INTRO_WORDS).date).toBe(
      "Friday 1 January",
    );
  });
});

describe("introScript", () => {
  it("fills both lines from the device clock and never throws", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 19, 5), toFake: ["Date"] });
    const greeting = document.createElement("span");
    greeting.id = INTRO_IDS.greeting;
    greeting.textContent = "Hello.";
    const date = document.createElement("span");
    date.id = INTRO_IDS.date;
    document.body.append(greeting, date);

    // The script is the source text the page inlines.
    new Function(introScript())();

    expect(greeting.textContent).toBe("Good evening.");
    expect(date.textContent).toBe("Sunday 1 November");
  });

  it("does nothing when its elements are missing", () => {
    expect(() => {
      new Function(introScript())();
    }).not.toThrow();
  });

  it("can't be closed early by its own data", () => {
    expect(introScript()).not.toContain("</");
  });
});
