// @vitest-environment node
import { describe, expect, it } from "vitest";

import { expectedDailyPoints, expectedPoints } from "./expected.ts";

const ladder = (s1: number, s2: number, s3: number, s4: number) => ({
  solveByClue: [s1, s2, s3, s4] as const,
});

describe("expectedPoints (CONTENT_GUIDE §8.3)", () => {
  it("sums the four cumulative solve shares", () => {
    expect(expectedPoints(ladder(0.3, 0.5, 0.8, 0.97))).toBe(2.57);
    expect(expectedPoints(ladder(0, 0, 0, 0))).toBe(0);
    expect(expectedPoints(ladder(1, 1, 1, 1))).toBe(4);
  });

  it("lands exactly on a window boundary that float addition would miss", () => {
    // As floats these sum to 3.1999999999999997 and 2.9999999999999996, under
    // the 3.2 and 3.0 window edges they should sit on.
    expect(0.6 + 0.8 + 0.9 + 0.9).toBeLessThan(3.2);
    expect(expectedPoints(ladder(0.6, 0.8, 0.9, 0.9))).toBe(3.2);
    expect(0.6 + 0.7 + 0.8 + 0.9).toBeLessThan(3);
    expect(expectedPoints(ladder(0.6, 0.7, 0.8, 0.9))).toBe(3);
    expect(expectedPoints(ladder(0.9, 0.9, 0.9, 0.9))).toBe(3.6);
  });

  it("adds a Daily's Mysteries for the schedule's predicted points", () => {
    expect(
      expectedDailyPoints([
        ladder(0.7, 0.8, 0.9, 0.95),
        ladder(0.4, 0.6, 0.8, 0.9),
        ladder(0.2, 0.4, 0.6, 0.8),
      ]),
    ).toBe(8.05);
    expect(expectedDailyPoints([])).toBe(0);
  });
});
