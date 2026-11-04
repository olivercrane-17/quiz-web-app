// @vitest-environment node
import { describe, expect, it } from "vitest";

import { BLITZ_BONUS_WINDOW_MS, blitzPoints } from "./blitz.ts";

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

  it("scores the same with the 8 s speed window passed, so a Relaxed Blitz run scores like a 60-second one", () => {
    expect(BLITZ_BONUS_WINDOW_MS).toBe(8000);
    for (const t of [0, 80, 4000, 7999, 8000, 16_000]) {
      expect(blitzPoints(t, true, BLITZ_BONUS_WINDOW_MS), `t = ${t}`).toBe(
        blitzPoints(t, true),
      );
    }
  });

  it("follows a tuned speed window, still rounding half up", () => {
    expect(blitzPoints(5000, true, 10_000)).toBe(125);
    expect(blitzPoints(10_000, true, 10_000)).toBe(100);
    // 50 × (1 - 100 / 10000) is exactly 49.5.
    expect(blitzPoints(100, true, 10_000)).toBe(150);
  });

  it("rounds the bonus half up exactly, so float noise moves no boundary", () => {
    // 50 × (1 - 80 / 8000) is exactly 49.5, and 50 × (1 - 240 / 8000) is 48.5.
    expect(blitzPoints(80, true)).toBe(150);
    expect(blitzPoints(81, true)).toBe(149);
    expect(blitzPoints(240, true)).toBe(149);
  });

  it("treats a negative time as 0 and refuses a window that isn't positive", () => {
    expect(blitzPoints(-50, true)).toBe(150);
    expect(() => blitzPoints(1000, true, 0)).toThrow(RangeError);
    expect(() => blitzPoints(1000, true, Number.NaN)).toThrow(RangeError);
    expect(() => blitzPoints(1000, true, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});
