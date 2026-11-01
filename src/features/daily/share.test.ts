import { describe, expect, it } from "vitest";

import { roundMeta } from "@/engine/run/testing";
import {
  parseAttemptId,
  parseDailyNumber,
  parseLocalDate,
  type AttemptSnapshot,
  type CategoryId,
  type ResolvedRound,
  type RoundReveal,
} from "@/engine/types";

import {
  BRAND,
  categoryShortName,
  dailyGrid,
  dailySharePayload,
  dailyShareText,
} from "./share";

const NBSP = " ";

function must<T>(value: T | null): T {
  if (value === null) throw new Error("bad test value");
  return value;
}

/** A reveal that names the answer, which the share text must never carry. */
function reveal(answer: string): RoundReveal {
  return {
    family: "mystery",
    answer: { display: answer },
  } as unknown as RoundReveal;
}

function mystery(
  index: number,
  category: CategoryId,
  solvedOn: 1 | 2 | 3 | 4 | null,
  answer: string,
): ResolvedRound {
  const cells = [1, 2, 3, 4].map((clue) =>
    solvedOn === null || clue < solvedOn
      ? ("passed" as const)
      : clue === solvedOn
        ? ("solved" as const)
        : ("unused" as const),
  );
  return {
    meta: {
      ...roundMeta(index, "mystery"),
      ordinal: index + 1,
      ofType: 3,
      category,
    },
    outcome: {
      family: "mystery",
      solvedOn,
      points: solvedOn === null ? 0 : 5 - solvedOn,
      voided: false,
      category,
      cells,
    },
    reveal: reveal(answer),
  };
}

const ENCORE: ResolvedRound = {
  meta: roundMeta(3, "encore"),
  outcome: {
    family: "encore",
    error: { kind: "relative", value: 0.04, display: "4% off" },
    band: "bullseye",
    voided: false,
  },
  reveal: {
    family: "encore",
    answer: 86.4,
  } as unknown as RoundReveal,
};

/** Daily #42 finished on 9/12, its rounds resolved out of order on purpose. */
function finished(overrides: Partial<AttemptSnapshot> = {}): AttemptSnapshot {
  return {
    attemptId: must(parseAttemptId("0f8fad5b-d9cb-469f-a165-70867728950e")),
    kind: "daily",
    ranked: true,
    daily: {
      dailyNumber: must(parseDailyNumber(42)),
      date: must(parseLocalDate("2026-11-01")),
    },
    composition: "m3e1",
    rounds: [],
    maxPoints: 12,
    resolved: [
      ENCORE,
      mystery(2, "sci", 3, "Bismuth"),
      mystery(0, "hist", 1, "Odile Marsh"),
      mystery(1, "geo", 2, "Valdoria"),
    ],
    current: null,
    status: "finished",
    points: 9,
    startedAt: Date.UTC(2026, 10, 1, 9),
    serverTime: Date.UTC(2026, 10, 1, 9, 6),
    ...overrides,
  };
}

describe("the stop screen's share text (PRD §3.5.1, DESIGN §6.11)", () => {
  it("reads in round order, with the category short names, and links to /daily on our origin", () => {
    const text = dailyShareText(finished(), {
      siteUrl: "https://knewt.app/",
      highContrast: false,
    });
    expect(text.split("\n")).toEqual([
      `${BRAND} Daily${NBSP}#42 · 9/12 · Encore${NBSP}4%${NBSP}off 🎯`,
      "History ✅⬜⬜⬜",
      "Geography 🟥✅⬜⬜",
      "Science & Tech 🟥🟥✅⬜",
      "https://knewt.app/daily",
    ]);
    for (const answer of ["Odile Marsh", "Valdoria", "Bismuth", "86.4"]) {
      expect(text).not.toContain(answer);
    }
  });

  it("swaps red and green for orange and blue in high contrast", () => {
    const text = dailyShareText(finished(), {
      siteUrl: "https://knewt.app",
      highContrast: true,
    });
    expect(text.split("\n").slice(1, 4)).toEqual([
      "History 🟦⬜⬜⬜",
      "Geography 🟧🟦⬜⬜",
      "Science & Tech 🟧🟧🟦⬜",
    ]);
  });

  it("marks archive plays in the payload, with the player's own grid", () => {
    const payload = dailySharePayload(finished({ kind: "archive" }), {
      siteUrl: "https://knewt.app",
      highContrast: false,
    });
    expect(payload.mode).toBe("archive");
    expect(payload.text.split("\n")[0]).toContain("(archive)");
    expect(dailyGrid(finished())).toEqual([
      ["solved", "unused", "unused", "unused"],
      ["passed", "solved", "unused", "unused"],
      ["passed", "passed", "solved", "unused"],
    ]);
  });

  it("names a category by its short name, and an unknown id as itself", () => {
    expect(categoryShortName("film" as CategoryId)).toBe("Film & TV");
    expect(categoryShortName("nope" as CategoryId)).toBe("nope");
  });
});
