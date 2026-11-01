import { describe, expect, it } from "vitest";

import { createRun, reduceRun } from "@/engine/run";
import { config, metas, roundMeta } from "@/engine/run/testing";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import type { RoundMeta } from "@/engine/types";

import {
  announcementText,
  answerTypeLine,
  continueLabel,
  elapsedMs,
  formatStopwatch,
  progressSegments,
  progressVariant,
  roundLabel,
  scoreBand,
} from "./labels";

const daily = (): RoundMeta[] =>
  [
    { ...roundMeta(0, "mystery"), ordinal: 1, ofType: 3, difficulty: "easy" },
    { ...roundMeta(1, "mystery"), ordinal: 2, ofType: 3, difficulty: "medium" },
    { ...roundMeta(2, "mystery"), ordinal: 3, ofType: 3, difficulty: "hard" },
    roundMeta(3, "encore"),
  ] as RoundMeta[];

describe("round labels", () => {
  it("name the round by type, place and difficulty (PRD §3.1.4)", () => {
    const [m1, m2, , encore] = daily();
    expect(roundLabel(m2!)).toBe("Mystery 2 of 3 · Medium");
    expect(roundLabel(encore!)).toBe("Encore");
    expect(roundLabel({ ...m1!, ofType: 1 })).toBe("Mystery · Easy");
    expect(
      roundLabel({
        ...roundMeta(3, "mc"),
        ordinal: 4,
        ofType: 9,
        difficulty: "easy",
      }),
    ).toBe("Question 4 of 9 · Easy");
    expect(answerTypeLine({ ...m1!, answerType: "element" })).toBe(
      "The answer is an element",
    );
    expect(answerTypeLine(encore!)).toBeNull();
  });
});

describe("Continue labels and progress pills", () => {
  it("name where Continue goes, and mark each round's result for sight and screen readers", () => {
    const plugins = createEchoRegistry();
    let state = createRun(
      config(daily(), { mode: "daily", sealed: true }),
      0,
    ).state;
    const step = (event: Parameters<typeof reduceRun>[1]) => {
      state = reduceRun(state, event, plugins).state;
    };
    const open = (index: number) => {
      const meta = state.slots[index]!.meta;
      step({
        type: "opened",
        at: 1000 * index,
        index,
        open:
          meta.type === "encore"
            ? {
                family: "encore",
                index,
                question: "How many?",
                unit: "steps",
                unitShort: "steps",
                unitLabel: "steps",
                valueKind: "quantity",
                decimals: 0,
                issuedAt: 0,
              }
            : {
                family: "mystery",
                index,
                clue: 1,
                clues: ["Echo clue 1"],
                wrongGuesses: [],
                options: null,
                issuedAt: 0,
              },
      });
    };
    open(0);
    expect(
      progressSegments(state).map((s) => [
        s.status,
        s.mark,
        s.current,
        s.label,
      ]),
    ).toEqual([
      ["upcoming", "M1", true, "Mystery 1, playing now"],
      ["upcoming", "M2", false, "Mystery 2, not started"],
      ["upcoming", "M3", false, "Mystery 3, not started"],
      ["upcoming", "E", false, "Encore, not started"],
    ]);

    const key = "00000000-0000-4000-8000-000000000001" as never;
    step({
      type: "intent",
      at: 500,
      key,
      intent: { family: "mystery", kind: "next_clue" },
    });
    step({
      type: "verdict",
      at: 600,
      key,
      verdict: {
        kind: "resolved",
        next: null,
        reveal: {
          family: "mystery",
          answer: { entityId: "fx.x.country.echo" as never, display: "Echo" },
          clues: ["1", "2", "3", "4"],
          solvedOn: 2,
          points: 3,
          pickedOption: null,
          explanation: "",
          learnMore: "",
          sourceLabels: [],
          crowd: null,
        },
      },
    });
    expect(continueLabel(state)).toBe("Next mystery");
    expect(progressSegments(state)[0]).toEqual({
      status: "correct",
      current: true,
      label: "Mystery 1, solved on clue 2",
      mark: "3",
    });

    // At the last Mystery's reveal, Continue goes to the Encore; at the Encore's, to the results.
    state = { ...state, index: 2 };
    expect(continueLabel(state)).toBe("On to the Encore");
    state = { ...state, index: 3 };
    expect(continueLabel(state)).toBe("See your results");
  });

  it("switch to slim segments when a composition has more rounds than pills fit", () => {
    const four = createRun(config(daily(), { sealed: true }), 0).state;
    expect(progressVariant(four)).toBe("pills");
    expect(progressSegments(four).map((s) => s.mark)).toEqual([
      "M1",
      "M2",
      "M3",
      "E",
    ]);

    const rounds = metas("mc", "mc", "mc", "mc", "mc", "mc", "mc", "encore");
    const eight = createRun(config(rounds, { sealed: true }), 0).state;
    expect(progressVariant(eight)).toBe("bar");
    expect(progressSegments(eight).every((s) => s.mark === undefined)).toBe(
      true,
    );
  });
});

describe("the stopwatch", () => {
  it("counts only open rounds, never a reveal or the time hidden, each capped at 15 minutes", () => {
    const plugins = createEchoRegistry();
    let state = createRun(config(daily(), { sealed: true }), 0).state;
    state = reduceRun(
      state,
      {
        type: "opened",
        at: 10_000,
        index: 0,
        open: {
          family: "mystery",
          index: 0,
          clue: 1,
          clues: ["c1"],
          wrongGuesses: [],
          options: null,
          issuedAt: 10_000,
        },
      },
      plugins,
    ).state;
    expect(elapsedMs(state, 12_000)).toBe(2000);
    state = reduceRun(
      state,
      { type: "visibility", at: 13_000, hidden: true },
      plugins,
    ).state;
    expect(elapsedMs(state, 15_000)).toBe(3000);
    state = reduceRun(
      state,
      { type: "visibility", at: 16_000, hidden: false },
      plugins,
    ).state;
    expect(elapsedMs(state, 17_000)).toBe(4000);
    expect(elapsedMs(state, 10_000 + 20 * 60_000)).toBe(15 * 60_000);
    expect(formatStopwatch(0)).toBe("0:00");
    expect(formatStopwatch(83_400)).toBe("1:23");
    expect(formatStopwatch(3_725_000)).toBe("1:02:05");
  });
});

describe("announcements", () => {
  it("say the verdict in words (PRD §3.0.3, §3.1.4)", () => {
    expect(
      announcementText({
        kind: "wrong_guess",
        guess: "Heat",
        clue: 3,
        clueText: "It won.",
      }),
    ).toBe("Not Heat. Clue 3, now worth 2: It won.");
    expect(
      announcementText({ kind: "next_clue", clue: 4, clueText: "Last." }),
    ).toBe("Clue 4, now worth 1: Last.");
    expect(
      announcementText({
        kind: "mystery_solved",
        answer: "Chile",
        clue: 3,
        points: 2,
      }),
    ).toBe("Knew it. Chile, solved on clue 3. 2 points.");
    expect(
      announcementText({
        kind: "mystery_solved",
        answer: "Chile",
        clue: 4,
        points: 1,
      }),
    ).toBe("Got it. Chile, on the last clue. 1 point.");
    expect(
      announcementText({ kind: "mystery_missed", answer: "Heat (1995)" }),
    ).toBe("This one got away. The answer was Heat (1995). 0 points.");
    expect(announcementText({ kind: "correct", answer: "Paris" })).toBe(
      "Correct. Paris.",
    );
    expect(
      announcementText({
        kind: "wrong_choice",
        chosen: "Lyon",
        answer: "Paris",
      }),
    ).toBe("Not quite. You chose Lyon. The answer is Paris.");
    const encore = (error: string, band: "bullseye" | "close" | null) =>
      announcementText({
        kind: "encore_result",
        guess: "1,200 km",
        answer: "1,250 km",
        error,
        band,
      });
    expect(encore("4% off", "bullseye")).toBe(
      "Bullseye. 4% off. The answer was 1,250 km.",
    );
    expect(encore("12% off", "close")).toBe(
      "Close. 12% off. The answer was 1,250 km.",
    );
    expect(encore("28% off", null)).toBe("28% off. The answer was 1,250 km.");
    expect(encore("Spot on", "bullseye")).toBe(
      "Spot on. The answer was 1,250 km.",
    );
    expect(encore("under 1% off", "bullseye")).toBe(
      "Bullseye. Under 1% off. The answer was 1,250 km.",
    );
  });

  it("band a score for run_complete", () => {
    expect([0, 3, 4, 6, 7, 9, 10, 12].map(scoreBand)).toEqual([
      "0-3",
      "0-3",
      "4-6",
      "4-6",
      "7-9",
      "7-9",
      "10-12",
      "10-12",
    ]);
  });
});
