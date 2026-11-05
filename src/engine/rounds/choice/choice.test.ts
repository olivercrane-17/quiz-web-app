// @vitest-environment node
import { describe, expect, it } from "vitest";

import { planPracticeRun } from "../../practice/plan.ts";
import { practiceJudgeContext } from "../../practice/rounds.ts";
import {
  localDate,
  practiceItem,
  syntheticPool,
} from "../../practice/testing.ts";
import { createRng } from "../../rng.ts";
import { sortKey } from "../../text/metrics.ts";
import type { ChoiceItem } from "../../types/content.ts";
import type { RoundMeta, RoundVerdict } from "../../types/rounds.ts";
import type { JudgeContext } from "../types.ts";
import {
  choiceDisplayOrder,
  choicePlugin,
  isPermutation,
  type ChoiceContent,
} from "./index.ts";

function meta(type: RoundMeta["type"] = "mc", index = 0): RoundMeta {
  return {
    index,
    type,
    difficulty: "medium",
    category: "geo",
    answerType: null,
    ordinal: index + 1,
    ofType: 10,
    maxPoints: 1,
    voided: false,
  };
}

function ctx(label: string, shuffle: readonly number[] | null = null) {
  return {
    at: 1_000,
    rng: createRng(label),
    shuffle,
    optionsFromClue: 4,
    entities: null,
  } satisfies JudgeContext;
}

const answer = (option: number) =>
  ({ family: "choice", kind: "answer", option }) as const;

const mc = practiceItem({ id: "p.geo.0001", p: 0.6 });
const ascending = practiceItem({
  id: "p.geo.0002",
  p: 0.6,
  shape: "mc_ascending",
});
const trueFalse = practiceItem({ id: "p.geo.0003", p: 0.6, shape: "tf" });
const comparison = practiceItem({
  id: "p.geo.0004",
  p: 0.6,
  shape: "comparison",
});

function labels(item: ChoiceContent, label: string, shuffle?: number[]) {
  return choicePlugin
    .open(item, meta(item.format), ctx(label, shuffle ?? null))
    .open.options.map((option) => option.label);
}

function resolved(verdict: RoundVerdict) {
  if (verdict.kind !== "resolved" || verdict.reveal.family !== "choice") {
    throw new Error("expected a choice reveal");
  }
  return verdict.reveal;
}

describe("the choice plugin: display order", () => {
  it("shuffles multiple choice from the round's rng, the same for the same seed", () => {
    expect(labels(mc, "a")).toEqual(labels(mc, "a"));
    const orders = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      orders.add(labels(mc, `seed:${seed}`).join("|"));
    }
    expect(orders.size).toBeGreaterThan(10);
  });

  it("uses the order stored for a sealed round, and ignores one that isn't a permutation", () => {
    expect(labels(mc, "a", [3, 2, 1, 0])).toEqual([
      "Fourth",
      "Third",
      "Second",
      "Right",
    ]);
    expect(labels(mc, "a", [0, 0, 1, 2])).toEqual(labels(mc, "a"));
    expect(isPermutation([1, 0], 2)).toBe(true);
    expect(isPermutation([1, 1], 2)).toBe(false);
    expect(isPermutation([0, 1, 2], 2)).toBe(false);
    expect(isPermutation([0, 1.5], 2)).toBe(false);
  });

  it("sorts numbers and dates ascending by sortKey, whatever the rng or the stored order", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      expect(labels(ascending, `seed:${seed}`, [1, 0, 3, 2])).toEqual([
        "80 km",
        "300 km",
        "1,250 km",
        "2,400 km",
      ]);
    }
    const dates = {
      ...ascending,
      options: ["AD 79", "500 BC", "1912", "44 BC"],
    };
    expect(labels(dates, "dates")).toEqual([
      "500 BC",
      "44 BC",
      "AD 79",
      "1912",
    ]);
  });

  it("falls back to a shuffle, never to source order, for options that can't be sorted", () => {
    const broken: ChoiceContent = {
      ...ascending,
      options: ["1,250 km", "300 miles", "Lots", "80 km"],
    };
    const firsts = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      firsts.add(labels(broken, `broken:${seed}`)[0] ?? "");
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("keeps true/false fixed as True, then False", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      expect(labels(trueFalse, `tf:${seed}`, [1, 0])).toEqual([
        "True",
        "False",
      ]);
    }
  });

  it("always shuffles a comparison, even one marked fixed, so the key's side varies", () => {
    const fixed: ChoiceContent = { ...comparison, order: "fixed" };
    const keySides = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) {
      const { judge } = choicePlugin.open(
        fixed,
        meta("comparison"),
        ctx(`c:${seed}`),
      );
      keySides.add(judge.correct);
    }
    expect(keySides).toEqual(new Set([0, 1]));
  });

  it("honours a fixed order on multiple choice that asks for one (user quizzes)", () => {
    const fixed: ChoiceContent = { ...mc, order: "fixed" };
    expect(labels(fixed, "x")).toEqual(["Right", "Second", "Third", "Fourth"]);
    expect(choiceDisplayOrder(fixed, createRng("x"))).toEqual([0, 1, 2, 3]);
  });

  it("AC-PRA-04 numeric and date options always render in ascending order, and other options vary in order across seeds", () => {
    const pool = syntheticPool();
    const keyPositions = new Map<string, Set<number>>();
    let ascendingSeen = 0;
    for (let run = 0; run < 1000; run += 1) {
      const seed = `ac-pra-04:${run}`;
      const plan = planPracticeRun(pool, {
        mode: "quick",
        category: "mixed",
        difficulty: "mixed",
        length: 10,
        seed,
        today: localDate("2026-11-01"),
        seen: new Map(),
        denylist: new Set(),
        ability: null,
      });
      plan.items.forEach((item: ChoiceItem, index) => {
        const { open, judge } = choicePlugin.open(
          item,
          meta(item.format, index),
          practiceJudgeContext(seed, index, 0),
        );
        const shown = open.options.map((option) => option.label);
        if (item.order === "ascending") {
          ascendingSeen += 1;
          const values = shown.map((label) => sortKey(label)?.value ?? NaN);
          expect(values).toEqual([...values].sort((a, b) => a - b));
        } else if (item.format === "tf") {
          expect(shown).toEqual(["True", "False"]);
        } else {
          const seen = keyPositions.get(item.id) ?? new Set<number>();
          seen.add(judge.correct);
          keyPositions.set(item.id, seen);
        }
      });
    }
    expect(ascendingSeen).toBeGreaterThan(500);
    // Every shuffled item served often enough shows its key in more than one place.
    const varied = [...keyPositions.values()].filter((set) => set.size > 1);
    expect(varied.length).toBeGreaterThan(keyPositions.size * 0.9);
    // Over many runs a four-option key lands in all four places.
    const four = [...keyPositions.entries()].filter(([id]) =>
      pool.some((item) => item.id === id && item.options.length === 4),
    );
    expect(four.some(([, set]) => set.size === 4)).toBe(true);
  });
});

describe("the choice plugin: judging", () => {
  it("scores 1 for the key and 0 otherwise, with the key named by display position", () => {
    const { open, judge } = choicePlugin.open(mc, meta(), ctx("judge"));
    const key = judge.correct;
    expect(open.options[key]?.label).toBe("Right");
    const right = choicePlugin.judge(mc, judge, answer(key), ctx("judge"));
    if (!right.ok) throw new Error("refused");
    expect(resolved(right.verdict)).toMatchObject({
      correctIndex: key,
      chosenIndex: key,
      correct: true,
      points: 1,
      valueDisplay: null,
      explanation: mc.explanation,
      learnMore: mc.learnMore,
      crowd: null,
    });
    expect(right.verdict.kind === "resolved" && right.verdict.next).toBeNull();
    const wrongOption = (key + 1) % 4;
    const wrong = choicePlugin.judge(mc, judge, answer(wrongOption), ctx("j"));
    if (!wrong.ok) throw new Error("refused");
    expect(resolved(wrong.verdict)).toMatchObject({
      correct: false,
      points: 0,
      chosenIndex: wrongOption,
      correctIndex: key,
    });
  });

  it("refuses an option that isn't on screen and a second answer", () => {
    const { judge } = choicePlugin.open(mc, meta(), ctx("refuse"));
    for (const option of [-1, 4, 1.5, Number.NaN]) {
      expect(choicePlugin.judge(mc, judge, answer(option), ctx("r"))).toEqual({
        ok: false,
        error: "invalid_input",
      });
    }
    const first = choicePlugin.judge(mc, judge, answer(0), ctx("r"));
    if (!first.ok) throw new Error("refused");
    expect(first.judge.answered).toBe(0);
    expect(choicePlugin.judge(mc, first.judge, answer(1), ctx("r"))).toEqual({
      ok: false,
      error: "stale",
    });
  });

  it("gives a comparison's two checked values in display order", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const { open, judge } = choicePlugin.open(
        comparison,
        meta("comparison"),
        ctx(`values:${seed}`),
      );
      const result = choicePlugin.judge(comparison, judge, answer(0), ctx("v"));
      if (!result.ok) throw new Error("refused");
      const reveal = resolved(result.verdict);
      const olderFirst = open.options[0]?.label.startsWith("Older");
      expect(reveal.valueDisplay).toEqual(
        olderFirst ? ["by 1096", "around 1325"] : ["around 1325", "by 1096"],
      );
    }
  });

  it("knows a true/false key by its fixed place", () => {
    const { judge } = choicePlugin.open(trueFalse, meta("tf"), ctx("tf"));
    // The test item's answer is False, the second option.
    expect(judge.correct).toBe(1);
  });
});

describe("the choice plugin: client half", () => {
  const opened = choicePlugin.open(mc, meta(), ctx("client"));
  const client = choicePlugin.init(opened.open);
  const key = opened.judge.correct;
  const wrong = (key + 1) % 4;
  const verdictFor = (option: number) => {
    const result = choicePlugin.judge(
      mc,
      opened.judge,
      answer(option),
      ctx("c"),
    );
    if (!result.ok) throw new Error("refused");
    return result.verdict;
  };

  it("accepts an option on screen and refuses anything else", () => {
    expect(choicePlugin.check(client, answer(2))).toEqual({ ok: true });
    expect(choicePlugin.check(client, answer(7))).toEqual({
      ok: false,
      error: "not_selectable",
    });
    expect(choicePlugin.check(client, answer(0.5))).toEqual({
      ok: false,
      error: "invalid_input",
    });
    const guessed = choicePlugin.init({
      ...opened.open,
      options: opened.open.options.map((o) => ({ ...o, alreadyGuessed: true })),
    });
    expect(choicePlugin.check(guessed, answer(0))).toEqual({
      ok: false,
      error: "already_guessed",
    });
  });

  it("has no outcome until the verdict, then one with its share cell", () => {
    expect(choicePlugin.outcome(client, meta())).toBeNull();
    const right = choicePlugin.apply(client, verdictFor(key));
    expect(choicePlugin.outcome(right, meta())).toEqual({
      family: "choice",
      correct: true,
      points: 1,
      voided: false,
      answerMs: null,
      cells: ["correct"],
    });
    const missed = choicePlugin.apply(client, verdictFor(wrong));
    expect(choicePlugin.outcome(missed, meta())?.cells).toEqual(["wrong"]);
    expect(choicePlugin.check(missed, answer(0))).toEqual({
      ok: false,
      error: "not_selectable",
    });
  });

  it("scores a withdrawn round as voided if one ever reaches it", () => {
    const voided = choicePlugin.apply(client, {
      kind: "resolved",
      reveal: { family: "withdrawn", round: "choice", points: 0, maxPoints: 1 },
      next: null,
    });
    expect(choicePlugin.outcome(voided, meta())).toMatchObject({
      voided: true,
      cells: ["voided"],
    });
  });

  it("keeps the client as it is for a verdict of another family", () => {
    const other = choicePlugin.apply(client, {
      kind: "continue",
      open: {
        family: "encore",
        index: 0,
        question: "How far?",
        unit: "kilometres",
        unitShort: "km",
        unitLabel: "in kilometres",
        valueKind: "quantity",
        decimals: 0,
        issuedAt: 0,
      },
    });
    expect(other).toBe(client);
  });

  it("announces the answer, and the pick when it was wrong", () => {
    expect(choicePlugin.announce(client, verdictFor(key))).toEqual({
      kind: "correct",
      answer: "Right",
    });
    expect(choicePlugin.announce(client, verdictFor(wrong))).toEqual({
      kind: "wrong_choice",
      chosen: opened.open.options[wrong]?.label,
      answer: "Right",
    });
    const unanswered = verdictFor(wrong);
    if (
      unanswered.kind !== "resolved" ||
      unanswered.reveal.family !== "choice"
    ) {
      throw new Error("expected a choice reveal");
    }
    expect(
      choicePlugin.announce(client, {
        ...unanswered,
        reveal: { ...unanswered.reveal, chosenIndex: null },
      }),
    ).toEqual({ kind: "wrong_choice", chosen: "", answer: "Right" });
    expect(
      choicePlugin.announce(client, { kind: "continue", open: opened.open }),
    ).toEqual({ kind: "correct", answer: "" });
  });

  it("is worth one point in every mode", () => {
    expect(choicePlugin.maxPoints(meta())).toBe(1);
    expect(choicePlugin.types).toEqual(["mc", "tf", "comparison"]);
  });
});
