import { describe, expect, it } from "vitest";

import { createFakeClock } from "@/engine/clock";

import { systemClock } from "./clock";
import {
  SERVER_CLOCK_KEY,
  createServerClock,
  type SessionStore,
} from "./server-clock";

function memorySession(
  initial: Record<string, string> = {},
): SessionStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("server clock", () => {
  it("corrects the local clock by the server time at the request's midpoint", () => {
    const base = createFakeClock(10_000);
    const clock = createServerClock({ base });
    expect(clock.now()).toBe(10_000);
    // Sent at 10,000, received at 10,200: the midpoint 10,100 is server 15,100.
    clock.observe(15_100, 10_000, 10_200);
    expect(clock.offsetMs()).toBe(5000);
    expect(clock.now()).toBe(15_000);
    base.advance(1000);
    expect(clock.now()).toBe(16_000);
    expect(clock.monotonic()).toBe(1000);
  });

  it("smooths over the median of the last five samples", () => {
    const clock = createServerClock({ base: createFakeClock(0) });
    for (const offset of [100, 120, 9000, 110, 130, 115])
      clock.observe(1000 + offset, 990, 1010);
    // The first sample has rolled out; the outlier doesn't move the median.
    expect(clock.samples()).toHaveLength(5);
    expect(clock.offsetMs()).toBe(120);
  });

  it("ignores samples that can't be right", () => {
    const clock = createServerClock({ base: createFakeClock(0) });
    clock.observe(Number.NaN, 0, 10);
    clock.observe(5000, 100, 50);
    clock.observe(10 ** 13, 0, 10);
    clock.observe(5000, 0, 120_000);
    expect(clock.samples()).toEqual([]);
    expect(clock.offsetMs()).toBe(0);
  });

  it("keeps its samples in session storage, so a reload starts corrected", () => {
    const session = memorySession();
    const first = createServerClock({
      base: createFakeClock(0),
      storage: session,
    });
    first.observe(2_000, 900, 1_100);
    expect(JSON.parse(session.map.get(SERVER_CLOCK_KEY) ?? "null")).toEqual({
      v: 1,
      samples: [{ offsetMs: 1000, rttMs: 200 }],
    });
    const reloaded = createServerClock({
      base: createFakeClock(0),
      storage: session,
    });
    expect(reloaded.offsetMs()).toBe(1000);
  });

  it("starts at zero offset from unreadable session storage", () => {
    const clock = createServerClock({
      base: createFakeClock(0),
      storage: memorySession({ [SERVER_CLOCK_KEY]: "{oops" }),
    });
    expect(clock.offsetMs()).toBe(0);
    const throwing: SessionStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const blocked = createServerClock({
      base: createFakeClock(0),
      storage: throwing,
    });
    expect(() => blocked.observe(100, 0, 0)).not.toThrow();
    expect(blocked.offsetMs()).toBe(100);
  });

  it("reads the system clock", () => {
    const before = Date.now();
    const now = systemClock.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(typeof systemClock.monotonic()).toBe("number");
  });
});
