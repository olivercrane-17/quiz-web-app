import { afterEach, describe, expect, it, vi } from "vitest";

import { MONTH_NAMES, WEEKDAY_NAMES, formatLongDate } from "@/engine/time";
import type { LocalDate } from "@/engine/types";
import { IDENTITY_KEY } from "@/platform/identity/local";
import { createKv, createMemoryStorage } from "@/platform/storage/kv";

import { HOME_COPY } from "./copy";
import {
  INTRO_IDS,
  INTRO_WORDS,
  identityStorageKey,
  introScript,
  introTextAt,
  isFirstVisit,
} from "./intro-text";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

describe("introTextAt", () => {
  it.each([
    [0, "Hello."],
    [2, "Hello."],
    [4, "Hello."],
    [5, "Good morning."],
    [11, "Good morning."],
    [12, "Good afternoon."],
    [17, "Good afternoon."],
    [18, "Good evening."],
    [23, "Good evening."],
  ])(
    "R1-35 at %i:00 says %s (D18: Hello. from midnight to 4:59)",
    (hour, greeting) => {
      expect(
        introTextAt(new Date(2026, 9, 31, hour, 0), INTRO_WORDS).greeting,
      ).toBe(greeting);
    },
  );

  it("R1-35 turns to Good morning. at 5:00, not before (D18)", () => {
    expect(
      introTextAt(new Date(2026, 9, 31, 4, 59, 59), INTRO_WORDS).greeting,
    ).toBe("Hello.");
    expect(
      introTextAt(new Date(2026, 9, 31, 5, 0, 0), INTRO_WORDS).greeting,
    ).toBe("Good morning.");
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

describe("the first-visit line", () => {
  it("R1-35 reads the identity where the kv layer keeps it, device namespaces included", () => {
    const storage = createMemoryStorage();
    createKv({ storage }).write(IDENTITY_KEY, { v: 1 });
    createKv({ storage, device: "phone-3" }).write(IDENTITY_KEY, { v: 1 });
    expect(storage.getItem(identityStorageKey(null))).not.toBeNull();
    expect(storage.getItem(identityStorageKey("phone-3"))).not.toBeNull();
    // A name the kv layer refuses falls back to the plain key, as kv does.
    expect(identityStorageKey("Not A Device")).toBe(IDENTITY_KEY);
  });

  it("R1-35 shows while the device has no identity, and storage that can't be read counts as none", () => {
    const storage = createMemoryStorage();
    expect(isFirstVisit(storage, "qz:identity")).toBe(true);
    storage.setItem("qz:identity", "{}");
    expect(isFirstVisit(storage, "qz:identity")).toBe(false);
    expect(isFirstVisit(null, "qz:identity")).toBe(true);
    const broken = {
      getItem(): string | null {
        throw new Error("SecurityError");
      },
    };
    expect(isFirstVisit(broken, "qz:identity")).toBe(true);
  });

  it("says what the Daily asks of a newcomer (D18)", () => {
    expect(HOME_COPY.firstVisit).toBe(
      "Name the mystery in as few clues as you can.",
    );
  });
});

describe("introScript", () => {
  /** The three placeholders the prerendered intro holds. */
  function placeholders() {
    const greeting = document.createElement("span");
    greeting.id = INTRO_IDS.greeting;
    greeting.textContent = "Hello.";
    const date = document.createElement("span");
    date.id = INTRO_IDS.date;
    const line = document.createElement("p");
    line.id = INTRO_IDS.firstVisit;
    document.body.append(greeting, date, line);
    return { greeting, date, line };
  }

  it("fills both lines from the device clock and never throws", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 19, 5), toFake: ["Date"] });
    const { greeting, date } = placeholders();

    // The script is the source text the page inlines.
    new Function(introScript({ devices: false }))();

    expect(greeting.textContent).toBe("Good evening.");
    expect(date.textContent).toBe("Sunday 1 November");
  });

  it("R1-35 says Hello. at 00:32 before first paint", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 0, 32), toFake: ["Date"] });
    const { greeting } = placeholders();
    new Function(introScript({ devices: false }))();
    expect(greeting.textContent).toBe("Hello.");
  });

  it("R1-35 keeps the first-visit line for a newcomer and hides it where an identity is stored", () => {
    const { line } = placeholders();
    new Function(introScript({ devices: false }))();
    expect(line.hidden).toBe(false);

    localStorage.setItem("qz:identity", "{}");
    new Function(introScript({ devices: false }))();
    expect(line.hidden).toBe(true);
  });

  it("R1-35 reads a test's device namespace in mock builds only", () => {
    const { line } = placeholders();
    vi.stubGlobal("__QZ_DEVICE__", "phone-3");
    localStorage.setItem("qz:d:phone-3:identity", "{}");

    new Function(introScript({ devices: false }))();
    expect(line.hidden).toBe(false);
    new Function(introScript({ devices: true }))();
    expect(line.hidden).toBe(true);
  });

  it("does nothing when its elements are missing", () => {
    expect(() => {
      new Function(introScript({ devices: true }))();
    }).not.toThrow();
  });

  it("can't be closed early by its own data", () => {
    expect(introScript({ devices: true })).not.toContain("</");
  });
});
