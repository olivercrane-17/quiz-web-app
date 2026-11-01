// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  MYSTERY_MAX_POINTS,
  VOIDED_MYSTERY_POINTS,
  asClueNumber,
  mysteryCells,
  mysteryPoints,
  nextClueNumber,
  worthOnClue,
} from "./mystery.ts";

describe("mystery scoring (PRD §4.1.2, §3.13.4)", () => {
  it("scores 5 - k for a solve on clue k, 0 for a miss and 4 for a void", () => {
    expect([1, 2, 3, 4].map((k) => mysteryPoints(k as 1 | 2 | 3 | 4))).toEqual([
      4, 3, 2, 1,
    ]);
    expect(mysteryPoints(null)).toBe(0);
    expect(mysteryPoints(null, true)).toBe(VOIDED_MYSTERY_POINTS);
    expect(mysteryPoints(2, true)).toBe(4);
    expect(MYSTERY_MAX_POINTS).toBe(4);
  });

  it("makes a wrong guess cost exactly what Next clue costs", () => {
    // Either one moves to clue k + 1, and the stake drops by one point.
    for (const clue of [1, 2, 3] as const) {
      const after = nextClueNumber(clue);
      expect(worthOnClue(after)).toBe(worthOnClue(clue) - 1);
    }
    expect(worthOnClue(4)).toBe(1);
  });

  it("lays out the share cells of §4.4.1", () => {
    expect(mysteryCells(1)).toEqual(["solved", "unused", "unused", "unused"]);
    expect(mysteryCells(3)).toEqual(["passed", "passed", "solved", "unused"]);
    expect(mysteryCells(null)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
  });

  it("narrows numbers to clue numbers", () => {
    expect(asClueNumber(3)).toBe(3);
    expect(asClueNumber(0)).toBeNull();
    expect(asClueNumber(5)).toBeNull();
    expect(asClueNumber(2.5)).toBeNull();
  });
});
