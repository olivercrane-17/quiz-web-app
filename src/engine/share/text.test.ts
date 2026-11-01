import { describe, expect, it } from "vitest";

import type {
  CategoryId,
  EncoreBand,
  RoundOutcome,
  ShareCell,
} from "../types/index.ts";
import {
  buildDailyShareText,
  encoreToken,
  shareGrid,
  shareRows,
  type DailyShareInput,
  type ShareGlyphs,
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
  bullseye: "@",
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
const NBSP = " ";

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
      `Knewt Daily${NBSP}#42 · 9/12 · Encore${NBSP}4%${NBSP}off @`,
      "Geography SUUU",
      "Film & TV RSUU",
      "Science & Tech RRSU",
      "https://knewt.app/daily",
    ]);
  });

  it("reads a miss as four passed squares, a voided Mystery in words, and archive plays as such", () => {
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
      `Knewt Daily${NBSP}#40 (archive) · 6/12 · Encore${NBSP}3${NBSP}years${NBSP}off`,
      "History RSUU",
      "Geography RRRR",
      "Science & Tech · voided",
      "https://knewt.app/daily",
    ]);
  });

  it("writes Encore tokens as DESIGN.md spells them, and none for a voided Encore", () => {
    const token = (display: string) =>
      encoreToken([encore(display, null)], GLYPHS)?.replaceAll(NBSP, " ");
    expect(token("Spot on")).toBe("Encore spot on");
    expect(token("under 1% off")).toBe("Encore under 1% off");
    expect(token("over 999% off")).toBe("Encore over 999% off");
    expect(encoreToken([encore("", null, true)], GLYPHS)).toBeNull();
    expect(encoreToken([mystery("geo", 1)], GLYPHS)).toBeNull();
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
      `Knewt Daily${NBSP}#42 · 7/9 · Encore${NBSP}12%${NBSP}off`,
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
