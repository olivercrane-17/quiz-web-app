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
  encoreMark,
  formatStopwatch,
  openRoundNumber,
  progressSegments,
  progressText,
  progressVariant,
  roundLabel,
  scoreBand,
  stopwatchMs,
  wholeSecond,
  withRecordedTime,
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

describe("the E pill once the Encore resolves (R2-06)", () => {
  type EncoreOutcome = Extract<
    NonNullable<RunState["slots"][number]["outcome"]>,
    { family: "encore" }
  >;

  const encoreOutcome = (
    display: string,
    band: "bullseye" | "close" | null,
    kind: "relative" | "years" = "relative",
  ): EncoreOutcome => ({
    family: "encore",
    error: { kind, value: 0.13, display },
    band,
    voided: false,
  });

  /** Daily #42 resumed finished, its Encore locked in with `outcome`. */
  function finishedWith(outcome: EncoreOutcome): RunState {
    const rounds = daily();
    const attemptId = parseAttemptId("3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f");
    if (attemptId === null) throw new Error("setup");
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
          meta: rounds[3]!,
          outcome,
          reveal: { family: "encore" } as unknown as RoundReveal,
          activeMs: 9_000,
        },
      ],
      current: null,
      status: "finished",
      points: 0,
      startedAt: 0,
      serverTime: 0,
    };
    return reduceRun(fresh(), { type: "resume", at: 1, snapshot }, plugins)
      .state;
  }

  it("R2-06 shows the bullseye emoji inside the bullseye band, and says so", () => {
    const pill = progressSegments(
      finishedWith(encoreOutcome("4% off", "bullseye")),
    )[3];
    expect(pill).toMatchObject({ status: "done", mark: "🎯" });
    expect(pill?.label).toBe("Encore, locked in, 4% off, a bullseye");
  });

  it("R2-06 shows the % off outside it, also in the pill's accessible name", () => {
    const close = progressSegments(
      finishedWith(encoreOutcome("13% off", "close")),
    )[3];
    expect(close).toMatchObject({ mark: "13%" });
    expect(close?.label).toBe("Encore, locked in, 13% off, a close guess");
    const far = progressSegments(
      finishedWith(encoreOutcome("39% off", null)),
    )[3];
    expect(far).toMatchObject({ mark: "39%" });
    expect(far?.label).toBe("Encore, locked in, 39% off");
  });

  it("R2-06 keeps the mark short enough for the pill at either end of the scale, and for years", () => {
    expect(encoreMark(encoreOutcome("over 999% off", null))).toBe(">999%");
    expect(encoreMark(encoreOutcome("under 1% off", "close"))).toBe("<1%");
    expect(encoreMark(encoreOutcome("8 years off", null, "years"))).toBe("8y");
    expect(encoreMark(encoreOutcome("Spot on", "bullseye"))).toBe("🎯");
    expect(
      encoreMark({ family: "encore", error: null, band: null, voided: false }),
    ).toBe("E");
  });

  it("R2-06 leaves an Encore not yet played as its E", () => {
    expect(progressSegments(fresh())[3]).toMatchObject({
      status: "upcoming",
      mark: "E",
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

  it("R1-03 leaves the finished rounds' marks to the pills' list, so the words stay one or two lines", () => {
    const m1 = resolved(opened(fresh(), 0, 0), 5_000, mysteryReveal(2));
    expect(progressText(m1)).toBe("Mystery 1 of 3");
    const m2 = opened({ ...m1, index: 1, phase: "opening" }, 1, 6_000);
    expect(progressText(m2)).toBe("Mystery 2 of 3");
    const missed = resolved(m2, 9_000, mysteryReveal(null));
    const m3 = resolved(
      opened({ ...missed, index: 2, phase: "opening" }, 2, 10_000),
      12_000,
      mysteryReveal(4),
    );
    // "Encore · M1 +3 · M2 ✕ · M3 +1" took four lines at 200% text on a
    // 360 px phone; the pills' list still names each result.
    const encore = { ...m3, index: 3, phase: "opening" as const };
    expect(progressText(encore)).toBe("Encore");
    expect(progressSegments(encore).map((segment) => segment.label)).toEqual([
      "Mystery 1, solved on clue 2, 3 points",
      "Mystery 2, missed",
      "Mystery 3, solved on clue 4, 1 point",
      "Encore, playing now",
    ]);
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

  it("R2-01 adds the response's trip back, on the server's clock, to the resumed round's offset", () => {
    const attemptId = parseAttemptId("3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f");
    if (attemptId === null) throw new Error("setup");
    const snapshot: AttemptSnapshot = {
      attemptId,
      kind: "daily",
      ranked: true,
      daily: null,
      composition: "m3e1",
      rounds: daily(),
      maxPoints: 12,
      resolved: [],
      current: { index: 0, open: mysteryOpen(0, 380_000), activeMs: 119_200 },
      status: "active",
      points: 0,
      startedAt: 0,
      serverTime: 500_000,
    };
    // The response took 350 ms to arrive after the server's snapshot.
    expect(timeOffsetOf(snapshot, 500_350)).toEqual({ index: 0, ms: 119_550 });
    // A server clock behind the snapshot adds nothing; a wild one, at most a minute.
    expect(timeOffsetOf(snapshot, 499_000)).toEqual({ index: 0, ms: 119_200 });
    expect(timeOffsetOf(snapshot, 10_000_000)).toEqual({
      index: 0,
      ms: 179_200,
    });
    expect(timeOffsetOf(snapshot, null)).toEqual({ index: 0, ms: 119_200 });
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

describe("one clock for the header and the stop screen (R2-08)", () => {
  /** Mystery 1 resolved in 90 s, Mystery 2 open at a reload with 30 s on the server. */
  function resumedOnMystery2(at: number) {
    const rounds = daily();
    const attemptId = parseAttemptId("3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f");
    if (attemptId === null) throw new Error("setup");
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
          reveal: mysteryReveal(2),
          activeMs: 90_000,
        },
      ],
      current: { index: 1, open: mysteryOpen(1, 470_000), activeMs: 30_000 },
      status: "active",
      points: 3,
      startedAt: 0,
      serverTime: 500_000,
    };
    const state = reduceRun(
      fresh(),
      { type: "resume", at, snapshot },
      plugins,
    ).state;
    return { state, offset: timeOffsetOf(snapshot) };
  }

  it("R2-08 a verdict with activeMs 75,000 on a slot that carried a 30,000 offset counts exactly 75,000", () => {
    const at = 2_000_000;
    const { state, offset } = resumedOnMystery2(at);
    expect(offset).toEqual({ index: 1, ms: 30_000 });
    // The device measured 47.3 s since the reload: with the offset, the
    // header would count 77.3 s for a round the server recorded as 75 s.
    const done = resolved(state, at + 47_300, mysteryReveal(3));
    expect(elapsedMs(done, at + 60_000, offset)).toBe(90_000 + 77_000);
    const recorded = withRecordedTime(done, offset, 1, 75_000);
    expect(recorded.offset).toBeNull();
    expect(recorded.state.slots[1]?.activeMs).toBe(75_000);
    expect(elapsedMs(recorded.state, at + 60_000, recorded.offset)).toBe(
      90_000 + 75_000,
    );
    // Reading the reveal adds nothing.
    expect(elapsedMs(recorded.state, at + 600_000, recorded.offset)).toBe(
      165_000,
    );
  });

  it("R2-08 leaves an open round, and another round's offset, as they were", () => {
    const at = 2_000_000;
    const { state, offset } = resumedOnMystery2(at);
    // Round 2 is still open: nothing has been recorded for it yet.
    expect(withRecordedTime(state, offset, 1, 75_000)).toEqual({
      state,
      offset,
    });
    // Round 1's time replaced; round 2's offset stays with round 2.
    const replaced = withRecordedTime(state, offset, 0, 88_000);
    expect(replaced.offset).toEqual(offset);
    expect(replaced.state.slots[0]?.activeMs).toBe(88_000);
    expect(withRecordedTime(state, offset, 0, Number.NaN).state).toBe(state);
  });

  it("R2-08 adds each resolved round in whole seconds, as the server does", () => {
    expect(wholeSecond(10_499)).toBe(10_000);
    expect(wholeSecond(10_500)).toBe(11_000);
    let state = opened(fresh(), 0, 0);
    state = resolved(state, 10_600, mysteryReveal(1));
    state = reduceRun(state, { type: "continue", at: 20_000 }, plugins).state;
    state = opened(state, 1, 20_000);
    state = resolved(state, 30_600, mysteryReveal(1));
    // 10.6 s and 10.6 s: 11 s each, never a 21.2 s that floors to 21.
    expect(elapsedMs(state, 40_000)).toBe(22_000);
  });

  it("R2-08 stops on the finish's total once it is known", () => {
    const state = opened(fresh(), 0, 0);
    expect(stopwatchMs(state, 61_000, null, null)).toBe(61_000);
    expect(stopwatchMs(state, 61_000, null, 187_000)).toBe(187_000);
    expect(formatStopwatch(stopwatchMs(state, 999_000, null, 187_000))).toBe(
      "3:07",
    );
  });
});

describe("announcements", () => {
  it("R1-22 D10 stamp a solve: Knew it. on clue 1 or 2 with no miss, Got there. on clue 3 or after a miss, Got it. on clue 4", () => {
    const solved = (clue: 1 | 2 | 3 | 4, missed?: boolean) =>
      announcementText(
        { kind: "mystery_solved", answer: "Chile", clue, points: 5 - clue },
        missed === undefined ? undefined : { missed },
      );
    expect(solved(1)).toBe("Knew it. Chile, solved on clue 1. 4 points.");
    expect(solved(2, false)).toBe(
      "Knew it. Chile, solved on clue 2. 3 points.",
    );
    // A wrong guess first: "Knew it." would read as unearned (R1-22).
    expect(solved(2, true)).toBe(
      "Got there. Chile, solved on clue 2. 3 points.",
    );
    expect(solved(3, false)).toBe(
      "Got there. Chile, solved on clue 3. 2 points.",
    );
    expect(solved(4, true)).toBe("Got it. Chile, on the last clue. 1 point.");
  });

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
    ).toBe("Got there. Chile, solved on clue 3. 2 points.");
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
