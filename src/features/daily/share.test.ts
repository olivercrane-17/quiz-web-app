import { describe, expect, it } from "vitest";

import { roundMeta } from "@/engine/run/testing";
import { drawMysteryCells } from "@/engine/share/text";
import {
  parseAttemptId,
  parseDailyNumber,
  parseLocalDate,
  type AttemptSnapshot,
  type CategoryId,
  type ResolvedRound,
  type RoundReveal,
} from "@/engine/types";

import { getSiteUrl } from "@/lib/env";

import {
  DEFAULT_GLYPHS,
  HIGH_CONTRAST_GLYPHS,
  drawGridRow,
  glyphsFor,
} from "./glyphs";
import {
  BRAND,
  SHARE_PATH,
  categoryShortName,
  dailyGrid,
  dailyLegend,
  dailyShareLink,
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
  it("R2-20 reads in round order, with the category short names, and links to Today on our origin", () => {
    const text = dailyShareText(finished(), {
      siteUrl: "https://knewt.app/",
      highContrast: false,
    });
    expect(text.split("\n")).toEqual([
      `${BRAND} Daily${NBSP}#42 · 9/12 · Encore${NBSP}off${NBSP}by${NBSP}4% 🎯`,
      "History ✅⬜⬜⬜",
      "Geography 🟧✅⬜⬜",
      "Science & Tech 🟧🟧✅⬜",
      "https://knewt.app/",
    ]);
    for (const answer of ["Odile Marsh", "Valdoria", "Bismuth", "86.4"]) {
      expect(text).not.toContain(answer);
    }
  });

  it("draws the solve in blue in high contrast, where a used clue is 🟧 too", () => {
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

  it("R1-18 links to getSiteUrl() plus a path, as both Share surfaces build it", () => {
    // The stop screen and the home card pass no origin, so the link is
    // always the build's own site URL (a port the personas didn't play on
    // was the harness's NEXT_PUBLIC_SITE_URL, not this code).
    const link = dailyShareText(finished(), { highContrast: false })
      .split("\n")
      .at(-1);
    expect(link).toBe(`${getSiteUrl()}${SHARE_PATH}`);
    expect(link).toMatch(/^https?:\/\/[^/?#]+\/$/);
    expect(
      dailySharePayload(finished(), { highContrast: true })
        .text.split("\n")
        .at(-1),
    ).toBe(link);
    expect(dailyShareLink("https://knewt.app///")).toBe("https://knewt.app/");
  });

  it("R2-20 opens Today until SHR-1's landing exists: dailyShareLink('https://x') is 'https://x/'", () => {
    expect(SHARE_PATH).toBe("/");
    expect(dailyShareLink("https://x")).toBe("https://x/");
  });
});

describe("decision D3 on the stop screen (R1-16)", () => {
  it("R1-16 paints every clue used before the solve 🟧, never red, in both sets", () => {
    for (const glyphs of [DEFAULT_GLYPHS, HIGH_CONTRAST_GLYPHS]) {
      expect(glyphs.cells.passed).toBe("🟧");
      expect(glyphs.cells.unused).toBe("⬜");
    }
    expect(DEFAULT_GLYPHS.cells.solved).toBe("✅");
    expect(HIGH_CONTRAST_GLYPHS.cells.solved).toBe("🟦");
    const text = dailyShareText(finished(), { highContrast: false });
    expect(text).not.toContain("🟥");
    expect(glyphsFor(true)).toBe(HIGH_CONTRAST_GLYPHS);
    expect(glyphsFor(false)).toBe(DEFAULT_GLYPHS);
  });

  it("R1-16 R2-09 explains the grid in one line, in the player's glyph set, a miss's ❌ included", () => {
    expect(dailyLegend(finished(), false)).toBe(
      "🟧 clue used · ✅ solved · ❌ missed · ⬜ not needed",
    );
    expect(dailyLegend(finished(), true)).toBe(
      "🟧 clue used · 🟦 solved · ❌ missed · ⬜ not needed",
    );
    expect(dailyLegend(finished({ resolved: [ENCORE] }), false)).toBeNull();
  });
});

describe("decision D22: a miss ends in ❌ (R2-09)", () => {
  /** Daily #42 with Geography missed: 3/12. */
  const withMiss = () =>
    finished({
      points: 5,
      resolved: [
        ENCORE,
        mystery(2, "sci", 3, "Bismuth"),
        mystery(0, "hist", 1, "Odile Marsh"),
        mystery(1, "geo", null, "Valdoria"),
      ],
    });

  it("R2-09 ends a missed Mystery's row in ❌ in the share text, in both glyph sets", () => {
    for (const highContrast of [false, true]) {
      const lines = dailyShareText(withMiss(), {
        siteUrl: "https://knewt.app",
        highContrast,
      }).split("\n");
      expect(lines[2]).toBe("Geography 🟧🟧🟧❌");
    }
    expect(DEFAULT_GLYPHS.missed).toBe("❌");
    expect(HIGH_CONTRAST_GLYPHS.missed).toBe("❌");
  });

  it("R2-09 draws the mini grid's rows as the share text does: a miss ends in ❌, questions cell by cell", () => {
    for (const glyphs of [DEFAULT_GLYPHS, HIGH_CONTRAST_GLYPHS]) {
      for (const row of [
        ...dailyGrid(withMiss()),
        ["wrong", "wrong"] as const,
        ["passed", "passed", "passed", "solved"] as const,
        [] as const,
      ]) {
        expect(drawGridRow(row, glyphs)).toBe(drawMysteryCells(row, glyphs));
      }
    }
    expect(drawGridRow(dailyGrid(withMiss())[1] ?? [], DEFAULT_GLYPHS)).toBe(
      "🟧🟧🟧❌",
    );
  });
});
