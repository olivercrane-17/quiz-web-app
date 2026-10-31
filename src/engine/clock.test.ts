// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createFakeClock } from "./clock.ts";

describe("createFakeClock", () => {
  it("starts at the given time with a monotonic reading of zero", () => {
    const clock = createFakeClock(1_000);
    expect(clock.now()).toBe(1_000);
    expect(clock.monotonic()).toBe(0);
  });

  it("advances wall and monotonic time together", () => {
    const clock = createFakeClock(1_000);
    clock.advance(250);
    clock.advance(0);
    expect(clock.now()).toBe(1_250);
    expect(clock.monotonic()).toBe(250);
  });

  it("sets wall time without moving monotonic time, as a clock change does", () => {
    const clock = createFakeClock(10_000);
    clock.advance(100);
    clock.set(5_000);
    expect(clock.now()).toBe(5_000);
    expect(clock.monotonic()).toBe(100);
  });

  it("refuses to run backwards or to take a non-number", () => {
    const clock = createFakeClock(0);
    expect(() => clock.advance(-1)).toThrow(RangeError);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
    expect(() => clock.set(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
