import { describe, expect, it } from "vitest";

import { mysteryCells } from "../run/outcome.ts";
import type {
  CategoryId,
  EncoreBand,
  RoundOutcome,
  ShareCell,
} from "../types/index.ts";
import {
  buildDailyShareText,
  drawMysteryCells,
  encoreToken,
  shareErrorWords,
  shareGrid,
  shareLegend,
  shareRowLines,
  shareRows,
  type DailyShareInput,
  type ShareGlyphs,
  type ShareLegendWords,
} from "./text.ts";

const GLYPHS: ShareGlyphs = {
  cells: {
    passed: "R",
    solved: "S",
    unused: "U",
    voided: "V",
    correct: "C",
    wrong: "W",
  },
  missed: "X",
  bullseye: "@",
};
/**
 * DESIGN §6.11's bytes after decisions D3 and D22, as the feature layer
 * passes them in: a used clue is 🟧 in both sets, so a wrong guess and Next
 * clue look alike and neither is red; the high-contrast set keeps 🟧 and
 * 🟦; a miss ends in ❌ in both.
 */
const DESIGN_GLYPHS: ShareGlyphs = {
  cells: {
    passed: "🟧",
    solved: "✅",
    unused: "⬜",
    voided: "⬜",
    correct: "✅",
    wrong: "🟥",
  },
  missed: "❌",
  bullseye: "🎯",
};
const HIGH_CONTRAST_GLYPHS: ShareGlyphs = {
  cells: {
    passed: "🟧",
    solved: "🟦",
    unused: "⬜",
    voided: "⬜",
    correct: "🟦",
    wrong: "🟧",
  },
  missed: "❌",
  bullseye: "🎯",
};
const LEGEND: ShareLegendWords = {
  passed: "clue used",
  solved: "solved",
  missed: "missed",
  unused: "not needed",
};
const SHORT: Partial<Record<CategoryId, string>> = {
  geo: "Geography",
  film: "Film & TV",
  sci: "Science & Tech",
  hist: "History",
};
const LABELS: DailyShareInput["labels"] = {
  category: (id) => SHORT[id] ?? id,
  choiceRow: "Questions",
  voided: "voided",
};
/** U+00A0, which keeps a token on one line. */
const NBSP = "\u00a0";

const cellsFor = (solvedOn: 1 | 2 | 3 | 4 | null): ShareCell[] =>
  solvedOn === null
    ? ["passed", "passed", "passed", "passed"]
    : [1, 2, 3, 4].map((clue) =>
        clue < solvedOn ? "passed" : clue === solvedOn ? "solved" : "unused",
      );

function mystery(
  category: CategoryId,
  solvedOn: 1 | 2 | 3 | 4 | null,
  voided = false,
): RoundOutcome {
  return {
    family: "mystery",
    solvedOn,
    points: voided ? 4 : solvedOn === null ? 0 : 5 - solvedOn,
    voided,
    category,
    cells: voided
      ? ["voided", "voided", "voided", "voided"]
      : cellsFor(solvedOn),
  };
}

function encore(
  display: string,
  band: EncoreBand,
  voided = false,
): RoundOutcome {
  return voided
    ? { family: "encore", error: null, band: null, voided: true }
    : {
        family: "encore",
        error: {
          kind: display.includes("year") ? "years" : "relative",
          value: 0.04,
          display,
        },
        band,
        voided: false,
      };
}

const choice = (correct: boolean): RoundOutcome => ({
  family: "choice",
  correct,
  points: correct ? 1 : 0,
  voided: false,
  answerMs: 1000,
  cells: [correct ? "correct" : "wrong"],
});

function input(overrides: Partial<DailyShareInput>): DailyShareInput {
  return {
    brand: "Knewt",
    dailyNumber: 42,
    archive: false,
    points: 9,
    maxPoints: 12,
    outcomes: [],
    glyphs: GLYPHS,
    labels: LABELS,
    link: "https://knewt.app/daily",
    ...overrides,
  };
}

describe("the Daily share text (PRD §3.5.1, DESIGN §6.11)", () => {
  it("puts the score and the Encore token on line 1, one row per Mystery, and the link last", () => {
    const text = buildDailyShareText(
      input({
        outcomes: [
          mystery("geo", 1),
          mystery("film", 2),
          mystery("sci", 3),
          encore("4% off", "bullseye"),
        ],
      }),
    );
    expect(text.split("\n")).toEqual([
      `Knewt Daily${NBSP}#42 · 9/12 · Encore${NBSP}off${NBSP}by${NBSP}4% @`,
      "Geography SUUU",
      "Film & TV RSUU",
      "Science & Tech RRSU",
      "https://knewt.app/daily",
    ]);
  });

  it("R2-09 D22 reads a miss as three passed squares and the missed mark, a voided Mystery in words, and archive plays as such", () => {
    const text = buildDailyShareText(
      input({
        archive: true,
        dailyNumber: 40,
        points: 6,
        outcomes: [
          mystery("hist", 2),
          mystery("geo", null),
          mystery("sci", null, true),
          encore("3 years off", "close"),
        ],
      }),
    );
    expect(text.split("\n")).toEqual([
      `Knewt Daily${NBSP}#40 (archive) · 6/12 · Encore${NBSP}off${NBSP}by${NBSP}3${NBSP}years`,
      "History RSUU",
      "Geography RRRX",
      "Science & Tech · voided",
      "https://knewt.app/daily",
    ]);
  });

  it("R1-19 D4 words the Encore token 'off by', so line 1 never reads like a sale, and none for a voided Encore", () => {
    const token = (display: string) =>
      encoreToken([encore(display, null)], GLYPHS)?.replaceAll(NBSP, " ");
    expect(token("4% off")).toBe("Encore off by 4%");
    expect(token("39% off")).toBe("Encore off by 39%");
    expect(token("under 1% off")).toBe("Encore off by under 1%");
    expect(token("over 999% off")).toBe("Encore off by over 999%");
    expect(token("1 year off")).toBe("Encore off by 1 year");
    expect(token("3 years off")).toBe("Encore off by 3 years");
    expect(token("Spot on")).toBe("Encore spot on");
    expect(encoreToken([encore("", null, true)], GLYPHS)).toBeNull();
    expect(encoreToken([mystery("geo", 1)], GLYPHS)).toBeNull();
  });

  it("R1-19 keeps the token on one line with no-break spaces, the bullseye glyph after it", () => {
    expect(encoreToken([encore("4% off", "bullseye")], GLYPHS)).toBe(
      `Encore${NBSP}off${NBSP}by${NBSP}4% @`,
    );
    expect(shareErrorWords("")).toBe("");
  });

  it("AC-DLY-09 collapses consecutive choice rounds into one row: nine for [mc ×9, encore], five then a Mystery row for [mc ×5, mystery, encore]", () => {
    const nine = buildDailyShareText(
      input({
        points: 7,
        maxPoints: 9,
        outcomes: [
          ...[true, true, false, true, true, true, false, true, true].map(
            choice,
          ),
          encore("12% off", "close"),
        ],
      }),
    ).split("\n");
    expect(nine).toEqual([
      `Knewt Daily${NBSP}#42 · 7/9 · Encore${NBSP}off${NBSP}by${NBSP}12%`,
      "Questions CCWCCCWCC",
      "https://knewt.app/daily",
    ]);

    const mixed = buildDailyShareText(
      input({
        points: 7,
        maxPoints: 9,
        outcomes: [
          ...[true, false, true, true, true].map(choice),
          mystery("film", 3),
          encore("Spot on", "bullseye"),
        ],
      }),
    ).split("\n");
    expect(mixed).toEqual([
      `Knewt Daily${NBSP}#42 · 7/9 · Encore${NBSP}spot${NBSP}on @`,
      "Questions CWCCC",
      "Film & TV RRSU",
      "https://knewt.app/daily",
    ]);
  });

  it("starts a new choice row after a Mystery splits a run of choice rounds", () => {
    const outcomes = [
      choice(true),
      mystery("geo", 1),
      choice(false),
      choice(true),
    ];
    expect(shareRows(outcomes).map((row) => row.kind)).toEqual([
      "choice",
      "mystery",
      "choice",
    ]);
    expect(shareGrid(outcomes)).toEqual([
      ["correct"],
      ["solved", "unused", "unused", "unused"],
      ["wrong", "correct"],
    ]);
  });

  it("never carries a percentile, streak or time, and the link has no query or fragment", () => {
    const text = buildDailyShareText(
      input({ outcomes: [mystery("geo", 1), encore("4% off", "bullseye")] }),
    );
    expect(text).not.toMatch(/%\s*of players|streak|\d+:\d\d/i);
    expect(text.split("\n").at(-1)).toMatch(/^https:\/\/[^?#]+$/);
  });
});

describe("decision D3: one glyph for every clue used before the solve", () => {
  it("R1-16 draws a wrong guess and Next clue alike: every clue before the solve is passed, the solve is solved, the rest unused", () => {
    // The cells carry no record of how a clue was passed, so the share
    // can't tell a miss from a skip, and a miss is four passed cells.
    expect(mysteryCells(3)).toEqual(["passed", "passed", "solved", "unused"]);
    expect(mysteryCells(null)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
  });

  it("R1-16 paints a used clue 🟧, never red, keeping ✅ and ⬜, in both glyph sets", () => {
    const outcomes = [
      mystery("hist", 2),
      mystery("geo", null),
      mystery("sci", 4),
      encore("4% off", "bullseye"),
    ];
    const rows = shareRows(outcomes);
    expect(shareRowLines(rows, DESIGN_GLYPHS, LABELS)).toEqual([
      "History 🟧✅⬜⬜",
      "Geography 🟧🟧🟧❌",
      "Science & Tech 🟧🟧🟧✅",
    ]);
    expect(shareRowLines(rows, HIGH_CONTRAST_GLYPHS, LABELS)).toEqual([
      "History 🟧🟦⬜⬜",
      "Geography 🟧🟧🟧❌",
      "Science & Tech 🟧🟧🟧🟦",
    ]);
    for (const line of shareRowLines(rows, DESIGN_GLYPHS, LABELS)) {
      expect(line).not.toContain("🟥");
    }
  });

  it("R1-16 explains the grid in one legend line, in the player's glyph set", () => {
    const rows = shareRows([mystery("geo", 1), mystery("film", null)]);
    expect(shareLegend(rows, DESIGN_GLYPHS, LEGEND)).toBe(
      "🟧 clue used · ✅ solved · ❌ missed · ⬜ not needed",
    );
    expect(shareLegend(rows, HIGH_CONTRAST_GLYPHS, LEGEND)).toBe(
      "🟧 clue used · 🟦 solved · ❌ missed · ⬜ not needed",
    );
  });

  it("R1-16 shows no legend for a grid with no Mystery row to explain", () => {
    expect(
      shareLegend(shareRows([choice(true), choice(false)]), GLYPHS, LEGEND),
    ).toBeNull();
    expect(
      shareLegend(shareRows([mystery("geo", null, true)]), GLYPHS, LEGEND),
    ).toBeNull();
    expect(shareLegend([], GLYPHS, LEGEND)).toBeNull();
  });
});

describe("decision D22: a miss ends in ❌ (RITE round 2, R2-09)", () => {
  it("R2-09 ends a miss in the missed mark, while a solve on clue 4 and a clue-1 solve draw cell by cell", () => {
    expect(drawMysteryCells(mysteryCells(null), DESIGN_GLYPHS)).toBe(
      "🟧🟧🟧❌",
    );
    expect(drawMysteryCells(mysteryCells(4), DESIGN_GLYPHS)).toBe("🟧🟧🟧✅");
    expect(drawMysteryCells(mysteryCells(1), DESIGN_GLYPHS)).toBe("✅⬜⬜⬜");
    // A wrong guess and Next clue still look the same: the cells are as
    // they were, and only a miss's last square changes.
    expect(mysteryCells(null)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    expect(drawMysteryCells([], DESIGN_GLYPHS)).toBe("");
  });

  it("R2-09 keeps ❌ in the high-contrast set, which reads by shape", () => {
    expect(drawMysteryCells(mysteryCells(null), HIGH_CONTRAST_GLYPHS)).toBe(
      "🟧🟧🟧❌",
    );
  });

  it("R2-09 draws a run of wrong questions cell by cell, never as a miss", () => {
    const rows = shareRows([choice(false), choice(false)]);
    expect(shareRowLines(rows, DESIGN_GLYPHS, LABELS)).toEqual([
      "Questions 🟥🟥",
    ]);
  });
});
