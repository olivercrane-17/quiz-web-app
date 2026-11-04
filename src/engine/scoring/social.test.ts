// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { RankFacts } from "./ranking.ts";
import { compareWeek, headToHead, rankWeek, weekLeaders } from "./social.ts";

const run = (points: number, totalMs: number): RankFacts => ({
  points,
  encore: null,
  totalMs,
});

describe("headToHead", () => {
  it("reports the verdict from your side and which key decided", () => {
    expect(headToHead(run(10, 9), run(9, 1))).toEqual({
      winner: "you",
      decidedBy: "points",
    });
    expect(headToHead(run(9, 200), run(9, 100))).toEqual({
      winner: "them",
      decidedBy: "time",
    });
    expect(headToHead(run(9, 100), run(9, 100))).toEqual({
      winner: "tie",
      decidedBy: "tie",
    });
  });
});

describe("the Group week (PRD §3.7.2)", () => {
  const dee = { name: "Dee", points: 71, daysPlayed: 7 };
  const priya = { name: "Priya", points: 71, daysPlayed: 6 };
  const sam = { name: "Sam", points: 64, daysPlayed: 7 };
  const ana = { name: "Ana", points: 64, daysPlayed: 7 };
  const lee = { name: "Lee", points: 12, daysPlayed: 1 };
  const rows = [lee, sam, priya, dee, ana];

  it("ranks by points, then days played; equal on both share the rank", () => {
    expect(
      rankWeek(rows).map((entry) => [entry.item.name, entry.rank, entry.tied]),
    ).toEqual([
      ["Dee", 1, false],
      ["Priya", 2, false],
      ["Sam", 3, true],
      ["Ana", 3, true],
      ["Lee", 5, false],
    ]);
    expect(compareWeek(dee, priya)).toBeLessThan(0);
  });

  it("names everyone tied on the top points for last week's banner", () => {
    expect(weekLeaders(rows)).toEqual({ rows: [priya, dee], points: 71 });
    expect(weekLeaders([sam])).toEqual({ rows: [sam], points: 64 });
  });

  it("names nobody when nobody scored", () => {
    expect(weekLeaders([])).toBeNull();
    expect(weekLeaders([{ points: 0, daysPlayed: 0 }])).toBeNull();
  });
});
