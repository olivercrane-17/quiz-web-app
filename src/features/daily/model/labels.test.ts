import { describe, expect, it } from "vitest";

import { createRun, reduceRun, type RunState } from "@/engine/run";
import { config, metas, roundMeta } from "@/engine/run/testing";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import {
  parseAttemptId,
  type AttemptSnapshot,
  type RoundMeta,
  type RoundOpen,
  type RoundReveal,
} from "@/engine/types";

import { timeOffsetOf } from "./controller";
import {
  announcementText,
  answerTypeLine,
  continueLabel,
  elapsedMs,
  formatStopwatch,
  openRoundNumber,
  progressSegments,
  progressText,
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

const plugins = createEchoRegistry();
const KEY = "00000000-0000-4000-8000-000000000001" as never;

function mysteryOpen(index: number, issuedAt: number): RoundOpen {
  return {
    family: "mystery",
    index,
    clue: 1,
    clues: ["Echo clue 1"],
    wrongGuesses: [],
    options: null,
    issuedAt,
  };
}

function mysteryReveal(solvedOn: 1 | 2 | 3 | 4 | null): RoundReveal {
  return {
    family: "mystery",
    answer: { entityId: "fx.x.country.echo" as never, display: "Echo" },
    clues: ["1", "2", "3", "4"],
    solvedOn,
    points: solvedOn === null ? 0 : 5 - solvedOn,
    pickedOption: null,
    explanation: "",
    learnMore: "",
    sourceLabels: [],
    crowd: null,
  };
}

/** The four-round Daily with round `index` opened at `at`. */
function opened(state: RunState, index: number, at: number): RunState {
  return reduceRun(
    state,
    { type: "opened", at, index, open: mysteryOpen(index, at) },
    plugins,
  ).state;
}

/** Resolves the open round at `at` with the reveal given. */
function resolved(state: RunState, at: number, reveal: RoundReveal): RunState {
  const asked = reduceRun(
    state,
    {
      type: "intent",
      at,
      key: KEY,
      intent: { family: "mystery", kind: "next_clue" },
    },
    plugins,
  ).state;
  return reduceRun(
    asked,
    {
      type: "verdict",
      at,
      key: KEY,
      verdict: { kind: "resolved", next: null, reveal },
    },
    plugins,
  ).state;
}

const fresh = () =>
  createRun(config(daily(), { mode: "daily", sealed: true }), 0).state;

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
      label: "Mystery 1, solved on clue 2, 3 points",
      mark: "+3",
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

describe("the header pills after decision D11", () => {
  it("R1-08 shows '+2' on a Mystery solved on clue 3, and names the 2 points for screen readers", () => {
    const state = resolved(opened(fresh(), 0, 0), 5_000, mysteryReveal(3));
    const [pill] = progressSegments(state);
    expect(pill).toMatchObject({ status: "correct", mark: "+2" });
    expect(pill?.label).toBe("Mystery 1, solved on clue 3, 2 points");
    expect(pill?.label).toContain("2 points");
  });

  it("R1-08 shows the X for a missed Mystery and says it was missed, with no number to misread", () => {
    const state = resolved(opened(fresh(), 0, 0), 5_000, mysteryReveal(null));
    const [pill] = progressSegments(state);
    expect(pill).toEqual({
      status: "wrong",
      current: true,
      label: "Mystery 1, missed",
    });
  });

  it("R1-08 names a clue-4 solve's single point", () => {
    const state = resolved(opened(fresh(), 0, 0), 5_000, mysteryReveal(4));
    expect(progressSegments(state)[0]).toMatchObject({
      mark: "+1",
      label: "Mystery 1, solved on clue 4, 1 point",
    });
  });
});

describe("the header's words when the pills don't fit (R1-03)", () => {
  it("R1-03 says where the run stands in words: the Mystery of three, the Encore, a question of nine", () => {
    expect(progressText(opened(fresh(), 0, 0))).toBe("Mystery 1 of 3");
    expect(progressText({ ...fresh(), index: 3 })).toBe("Encore");
    const nine = createRun(
      config(
        metas(
          "mc",
          "mc",
          "mc",
          "mc",
          "mc",
          "mc",
          "mc",
          "mc",
          "mc",
          "encore",
        ).map((meta, index) =>
          index < 9 ? { ...meta, ordinal: index + 1, ofType: 9 } : meta,
        ),
        { sealed: true },
      ),
      0,
    ).state;
    expect(progressText({ ...nine, index: 3 })).toBe("Question 4 of 9");
    expect(progressText({ ...fresh(), index: 9 })).toBe("Daily progress");
  });

  it("R1-03 keeps each finished Mystery's mark in the words, as its pill shows it", () => {
    const m1 = resolved(opened(fresh(), 0, 0), 5_000, mysteryReveal(2));
    // The reveal still open: Mystery 1's own mark shows at once.
    expect(progressText(m1)).toBe("Mystery 1 of 3 · M1 +3");
    const m2 = opened({ ...m1, index: 1, phase: "opening" }, 1, 6_000);
    expect(progressText(m2)).toBe("Mystery 2 of 3 · M1 +3");
    const missed = resolved(m2, 9_000, mysteryReveal(null));
    const m3 = resolved(
      opened({ ...missed, index: 2, phase: "opening" }, 2, 10_000),
      12_000,
      mysteryReveal(4),
    );
    expect(progressText({ ...m3, index: 3, phase: "opening" })).toBe(
      "Encore · M1 +3 · M2 ✕ · M3 +1",
    );
    // A withdrawn Mystery shows the pill's dash, never its 4 points.
    const slots = m2.slots.map((slot, index) =>
      index === 0 && slot.outcome?.family === "mystery"
        ? { ...slot, outcome: { ...slot.outcome, voided: true, points: 4 } }
        : slot,
    );
    expect(progressText({ ...m2, slots })).toBe("Mystery 2 of 3 · M1 –");
  });

  it("R1-03 counts the questions right so far, in round order, for compositions with choice rounds", () => {
    const answered = (correct: boolean, voided = false) => ({
      family: "choice" as const,
      correct,
      points: correct ? 1 : 0,
      voided,
      answerMs: null,
      cells: [],
    });
    const mixed = createRun(
      config(
        metas("mc", "mc", "mc", "mc", "mc", "mystery", "encore").map(
          (meta, index) =>
            index < 5
              ? { ...meta, ordinal: index + 1, ofType: 5 }
              : index === 5
                ? { ...meta, ordinal: 1, ofType: 1 }
                : meta,
        ),
        { sealed: true },
      ),
      0,
    ).state;
    const results = [true, true, false, true, true];
    const upTo = (count: number) =>
      mixed.slots.map((slot, index) =>
        index < count ? { ...slot, outcome: answered(results[index]!) } : slot,
      );
    expect(progressText({ ...mixed, slots: upTo(3), index: 3 })).toBe(
      "Question 4 of 5 · 2 of 3 right",
    );
    const done = upTo(5);
    const solved = done.map((slot, index) =>
      index === 5
        ? {
            ...slot,
            outcome: {
              family: "mystery" as const,
              solvedOn: 3 as const,
              points: 2,
              voided: false,
              category: "film" as never,
              cells: [],
            },
          }
        : slot,
    );
    expect(progressText({ ...mixed, slots: solved, index: 6 })).toBe(
      "Encore · 4 of 5 right · M1 +2",
    );
    // A withdrawn question is out of the count, as it is out of play.
    const withdrawn = done.map((slot, index) =>
      index === 2 ? { ...slot, outcome: answered(false, true) } : slot,
    );
    expect(progressText({ ...mixed, slots: withdrawn, index: 5 })).toBe(
      "Mystery · 4 of 4 right",
    );
  });

  it("names the open round for how_to_play_open, and none once the run is over", () => {
    expect(openRoundNumber(null)).toBe("none");
    expect(openRoundNumber(opened(fresh(), 0, 0))).toBe(1);
    expect(openRoundNumber({ ...fresh(), index: 2, phase: "revealed" })).toBe(
      3,
    );
    expect(openRoundNumber({ ...fresh(), phase: "finished" })).toBe("none");
  });
});

describe("the stopwatch", () => {
  it("AC-DLY-12 shows the running total across rounds, still on a reveal and before the next clue arrives, at most 15 minutes a round", () => {
    let state = opened(fresh(), 0, 10_000);
    expect(elapsedMs(state, 70_000)).toBe(60_000);
    state = resolved(state, 70_000, mysteryReveal(2));
    // The reveal is open: reading never counts.
    expect(elapsedMs(state, 130_000)).toBe(60_000);
    state = reduceRun(state, { type: "continue", at: 130_000 }, plugins).state;
    expect(state.phase).toBe("opening");
    // Continue tapped, the next clue not here yet: still frozen.
    expect(elapsedMs(state, 135_000)).toBe(60_000);
    state = opened(state, 1, 136_000);
    expect(elapsedMs(state, 166_000)).toBe(90_000);
    // One round adds 15 minutes at most, however long it stays open.
    expect(elapsedMs(state, 136_000 + 60 * 60_000)).toBe(60_000 + 15 * 60_000);
  });

  it("R1-06 resuming a snapshot whose Mystery 1 took 90 s and whose Mystery 2 had 30 s gives 2:00", () => {
    const rounds = daily();
    const attemptId = parseAttemptId("3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f");
    if (attemptId === null) throw new Error("setup");
    const reveal = mysteryReveal(2);
    const snapshot: AttemptSnapshot = {
      attemptId,
      kind: "daily",
      ranked: true,
      daily: null,
      composition: "m3e1",
      rounds,
      maxPoints: 12,
      resolved: [
        {
          meta: rounds[0]!,
          outcome: {
            family: "mystery",
            solvedOn: 2,
            points: 3,
            voided: false,
            category: "geo",
            cells: ["passed", "solved", "unused", "unused"],
          },
          reveal,
          activeMs: 90_000,
        },
      ],
      current: {
        index: 1,
        // The open Mystery's clue was issued 30 s before serverTime.
        open: mysteryOpen(1, 470_000),
        activeMs: 30_000,
      },
      status: "active",
      points: 3,
      startedAt: 0,
      serverTime: 500_000,
    };
    const at = 2_000_000;
    const state = reduceRun(
      fresh(),
      { type: "resume", at, snapshot },
      plugins,
    ).state;
    const offset = timeOffsetOf(snapshot);
    expect(offset).toEqual({ index: 1, ms: 30_000 });
    expect(elapsedMs(state, at, offset)).toBe(120_000);
    expect(formatStopwatch(elapsedMs(state, at, offset))).toBe("2:00");
    expect(elapsedMs(state, at + 5_000, offset)).toBe(125_000);

    // Once that Mystery resolves, its time before the reload still counts.
    const done = resolved(state, at + 10_000, mysteryReveal(3));
    expect(done.slots[1]?.activeMs).toBe(10_000);
    expect(elapsedMs(done, at + 60_000, offset)).toBe(130_000);
  });

  it("R1-06 falls back to the time since the open clue was issued when the backend reports no interval", () => {
    const attemptId = parseAttemptId("3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f");
    if (attemptId === null) throw new Error("setup");
    const base: AttemptSnapshot = {
      attemptId,
      kind: "daily",
      ranked: true,
      daily: null,
      composition: "m3e1",
      rounds: daily(),
      maxPoints: 12,
      resolved: [],
      current: { index: 0, open: mysteryOpen(0, 470_000) },
      status: "active",
      points: 0,
      startedAt: 0,
      serverTime: 500_000,
    };
    expect(timeOffsetOf(base)).toEqual({ index: 0, ms: 30_000 });
    expect(timeOffsetOf({ ...base, serverTime: 470_000 })).toBeNull();
    expect(
      timeOffsetOf({ ...base, current: { index: 1, open: null } }),
    ).toBeNull();
    expect(timeOffsetOf({ ...base, current: null })).toBeNull();
  });

  it("caps a round's time before the reload with the rest of it at 15 minutes", () => {
    const state = opened(fresh(), 0, 0);
    expect(elapsedMs(state, 10 * 60_000, { index: 0, ms: 10 * 60_000 })).toBe(
      15 * 60_000,
    );
    // An offset for a round that isn't running still counts, capped.
    expect(elapsedMs(fresh(), 0, { index: 2, ms: 20 * 60_000 })).toBe(
      15 * 60_000,
    );
  });

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
    // A withdrawal has no answer to name, and is never called a miss.
    expect(announcementText({ kind: "mystery_missed", answer: "" })).toBe(
      "This Mystery was withdrawn because we got it wrong. Everyone gets 4 points.",
    );
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
