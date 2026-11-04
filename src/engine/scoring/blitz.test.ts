// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BLITZ_RELAXED_RUN_MS,
  BLITZ_STANDARD_RUN_MS,
  blitzBonusWindowMs,
  blitzPoints,
} from "./blitz.ts";

describe("blitzPoints", () => {
  it("AC-BLZ-02 scores 150 at t = 0, 125 at t = 4 s, 100 from t = 8 s, and 0 when wrong", () => {
    expect(blitzPoints(0, true)).toBe(150);
    expect(blitzPoints(4000, true)).toBe(125);
    expect(blitzPoints(8000, true)).toBe(100);
    expect(blitzPoints(8001, true)).toBe(100);
    expect(blitzPoints(30_000, true)).toBe(100);
    expect(blitzPoints(0, false)).toBe(0);
    expect(blitzPoints(9000, false)).toBe(0);
  });

  it("AC-BLZ-02 scores the 60-second run the same with its length passed", () => {
    expect(blitzPoints(0, true, BLITZ_STANDARD_RUN_MS)).toBe(150);
    expect(blitzPoints(4000, true, BLITZ_STANDARD_RUN_MS)).toBe(125);
    expect(blitzPoints(8000, true, BLITZ_STANDARD_RUN_MS)).toBe(100);
  });

  it("gives the 120-second Relaxed Blitz a 16 s window (decisions memo §14.3)", () => {
    expect(blitzBonusWindowMs(BLITZ_RELAXED_RUN_MS)).toBe(16_000);
    expect(blitzPoints(0, true, BLITZ_RELAXED_RUN_MS)).toBe(150);
    expect(blitzPoints(4000, true, BLITZ_RELAXED_RUN_MS)).toBe(138);
    expect(blitzPoints(8000, true, BLITZ_RELAXED_RUN_MS)).toBe(125);
    expect(blitzPoints(16_000, true, BLITZ_RELAXED_RUN_MS)).toBe(100);
    expect(blitzPoints(20_000, true, BLITZ_RELAXED_RUN_MS)).toBe(100);
    expect(blitzPoints(1000, false, BLITZ_RELAXED_RUN_MS)).toBe(0);
  });

  it("rounds the bonus half up exactly, so float noise moves no boundary", () => {
    // 50 × (1 - 80 / 8000) is exactly 49.5, and 50 × (1 - 240 / 8000) is 48.5.
    expect(blitzPoints(80, true)).toBe(150);
    expect(blitzPoints(81, true)).toBe(149);
    expect(blitzPoints(240, true)).toBe(149);
  });

  it("treats a negative time as 0 and refuses a run with no length", () => {
    expect(blitzPoints(-50, true)).toBe(150);
    expect(() => blitzPoints(1000, true, 0)).toThrow(RangeError);
    expect(() => blitzPoints(1000, true, Number.NaN)).toThrow(RangeError);
    expect(blitzBonusWindowMs()).toBe(8000);
  });
});
