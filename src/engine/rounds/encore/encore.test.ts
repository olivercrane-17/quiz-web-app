// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createRng } from "../../rng.ts";
import type { EncoreContent } from "../../types/content.ts";
import { parseItemId, type ItemId } from "../../types/ids.ts";
import type { RoundMeta } from "../../types/rounds.ts";
import { PLUGINS } from "../index.ts";
import type { JudgeContext } from "../types.ts";
import { encorePlugin, encoreVerdictOf } from "./index.ts";

function item(text: string): ItemId {
  const id = parseItemId(text);
  if (id === null) throw new Error(text);
  return id;
}

function encore(overrides: Partial<EncoreContent> = {}): EncoreContent {
  return {
    id: item("fx.e.0101"),
    category: "geo",
    tags: [],
    region: "global",
    volatility: "evergreen",
    reviewBy: null,
    seededDifficulty: 3,
    explanation: "The tower has 212 steps.",
    learnMore: "Harbour Tower (fixture)",
    kind: "encore",
    question: "How many steps climb the tower?",
    unit: "kilometres",
    unitShort: "km",
    unitLabel: "in kilometres",
    valueKind: "quantity",
    answer: 1250,
    decimals: 0,
    bands: null,
    predicted: { pClose: 0.3, pExact: 0.05, spread: 0.1, estimator: "v0" },
    sourceLabels: ["Fixture survey"],
    ...overrides,
  };
}

const meta: RoundMeta = {
  index: 3,
  type: "encore",
  difficulty: null,
  category: "geo",
  answerType: null,
  ordinal: 1,
  ofType: 1,
  maxPoints: 0,
  voided: false,
};

const ctx: JudgeContext = {
  at: 9000,
  rng: createRng("encore-test"),
  shuffle: null,
  optionsFromClue: 4,
  entities: null,
};

const lockIn = (value: number) =>
  ({ family: "encore", kind: "lock_in", value }) as const;

describe("the encore plugin", () => {
  it("is the registry's encore plugin, worth no points", () => {
    expect(PLUGINS.encore).toBe(encorePlugin);
    expect(encorePlugin.maxPoints(meta)).toBe(0);
  });

  it("opens with the question, the unit words and the number's rules, never the answer", () => {
    const { open, judge } = encorePlugin.open(encore(), meta, ctx);
    expect(open).toEqual({
      family: "encore",
      index: 3,
      question: "How many steps climb the tower?",
      unit: "kilometres",
      unitShort: "km",
      unitLabel: "in kilometres",
      valueKind: "quantity",
      decimals: 0,
      issuedAt: 9000,
    });
    expect(JSON.stringify(open)).not.toContain("1250");
    expect(judge).toEqual({ index: 3, issuedAt: 9000, result: null });
  });

  it("resolves one lock-in with the error, band and display (PRD §4.2.4)", () => {
    const content = encore();
    const { judge } = encorePlugin.open(content, meta, ctx);
    const result = encorePlugin.judge(content, judge, lockIn(1200), {
      ...ctx,
      at: 12_000,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.judge.result).toEqual({ guess: 1200, at: 12_000 });
    expect(result.verdict).toEqual({
      kind: "resolved",
      reveal: {
        family: "encore",
        guess: 1200,
        answer: 1250,
        unit: "kilometres",
        unitShort: "km",
        error: { kind: "relative", value: 50 / 1200, display: "4% off" },
        band: "bullseye",
        explanation: "The tower has 212 steps.",
        learnMore: "Harbour Tower (fixture)",
        sourceLabels: ["Fixture survey"],
        crowd: null,
      },
      next: null,
    });
    // The guess can't change afterwards.
    expect(
      encorePlugin.judge(content, result.judge, lockIn(1250), ctx),
    ).toEqual({
      ok: false,
      error: "stale",
    });
    // A replayed key gets the same answer back.
    expect(encoreVerdictOf(content, result.judge)).toEqual(result.verdict);
  });

  it("re-checks the number it receives, as round_judge_encore does", () => {
    const content = encore({ decimals: 1, answer: 86.4 });
    const { judge } = encorePlugin.open(content, meta, ctx);
    for (const value of [0, -3, 86.45, 1e16, Number.NaN]) {
      expect(encorePlugin.judge(content, judge, lockIn(value), ctx)).toEqual({
        ok: false,
        error: "invalid_input",
      });
    }
    const year = encore({
      valueKind: "year",
      answer: 1388,
      unit: "",
      unitShort: "",
      unitLabel: "",
    });
    const y = encorePlugin.open(year, meta, ctx).judge;
    expect(encorePlugin.judge(year, y, lockIn(10_000), ctx)).toEqual({
      ok: false,
      error: "invalid_input",
    });
    const ok = encorePlugin.judge(year, y, lockIn(1390), ctx);
    if (
      !ok.ok ||
      ok.verdict.kind !== "resolved" ||
      ok.verdict.reveal.family !== "encore"
    ) {
      throw new Error();
    }
    expect(ok.verdict.reveal.error).toEqual({
      kind: "years",
      value: 2,
      display: "2 years off",
    });
    expect(ok.verdict.reveal.band).toBe("bullseye");
  });

  it("uses an Encore's own bands", () => {
    const content = encore({ bands: { bullseye: 0.01, close: 0.02 } });
    const { judge } = encorePlugin.open(content, meta, ctx);
    const result = encorePlugin.judge(content, judge, lockIn(1200), ctx);
    if (!result.ok || result.verdict.kind !== "resolved") throw new Error();
    expect(result.verdict.reveal).toMatchObject({ band: null });
  });
});

describe("the encore client half", () => {
  const { open } = encorePlugin.open(encore({ decimals: 1 }), meta, ctx);

  it("checks the value by the open's rules and refuses after the reveal", () => {
    const client = encorePlugin.init(open);
    expect(encorePlugin.check(client, lockIn(1250.5))).toEqual({ ok: true });
    expect(encorePlugin.check(client, lockIn(1250.55))).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(encorePlugin.check(client, lockIn(0))).toEqual({
      ok: false,
      error: "invalid_input",
    });
    const done = encorePlugin.apply(client, {
      kind: "resolved",
      reveal: { family: "withdrawn", round: "encore", points: 0, maxPoints: 0 },
      next: null,
    });
    expect(encorePlugin.check(done, lockIn(1250))).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });

  it("reports the outcome, a void as no error", () => {
    const client = encorePlugin.init(open);
    expect(encorePlugin.outcome(client, meta)).toBeNull();
    const content = encore();
    const { judge } = encorePlugin.open(content, meta, ctx);
    const result = encorePlugin.judge(content, judge, lockIn(900), ctx);
    if (!result.ok) throw new Error(result.error);
    expect(
      encorePlugin.outcome(encorePlugin.apply(client, result.verdict), meta),
    ).toEqual({
      family: "encore",
      error: { kind: "relative", value: 350 / 900, display: "39% off" },
      band: null,
      voided: false,
    });
    const voided = encorePlugin.apply(client, {
      kind: "resolved",
      reveal: { family: "withdrawn", round: "encore", points: 0, maxPoints: 0 },
      next: null,
    });
    expect(encorePlugin.outcome(voided, meta)).toEqual({
      family: "encore",
      error: null,
      band: null,
      voided: true,
    });
    // Continue verdicts don't exist for an Encore; the client ignores them.
    expect(encorePlugin.apply(client, { kind: "continue", open })).toBe(client);
  });

  it("announces the result with grouped numbers and units", () => {
    const quantity = encorePlugin.open(encore(), meta, ctx).open;
    const client = encorePlugin.init(quantity);
    const content = encore();
    const result = encorePlugin.judge(
      content,
      encorePlugin.open(content, meta, ctx).judge,
      lockIn(1100),
      ctx,
    );
    if (!result.ok) throw new Error(result.error);
    expect(encorePlugin.announce(client, result.verdict)).toEqual({
      kind: "encore_result",
      guess: "1,100 km",
      answer: "1,250 km",
      error: "14% off",
      band: "close",
    });
    expect(
      encorePlugin.announce(client, {
        kind: "resolved",
        reveal: {
          family: "withdrawn",
          round: "encore",
          points: 0,
          maxPoints: 0,
        },
        next: null,
      }),
    ).toEqual({
      kind: "encore_result",
      guess: "",
      answer: "",
      error: "",
      band: null,
    });
  });
});
