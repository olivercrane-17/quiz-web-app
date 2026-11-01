// @vitest-environment node
/**
 * Replays src/engine/fixtures/mystery-scoring.json (ARCHITECTURE §4.13)
 * through both halves of the mystery plugin: the judge decides each step,
 * the client half applies the verdicts and checks intents the same way,
 * and the resolved outcome must match the row. SQL replays the same rows.
 */
import { describe, expect, it } from "vitest";

import table from "../../fixtures/mystery-scoring.json";
import { createRng } from "../../rng.ts";
import type { MysteryContent } from "../../types/content.ts";
import {
  parseEntityId,
  parseItemId,
  type EntityId,
  type ItemId,
} from "../../types/ids.ts";
import type { RoundIntent, RoundMeta } from "../../types/rounds.ts";
import type { EntityLookup, EntityRecord, JudgeContext } from "../types.ts";
import {
  mysteryPlugin,
  type MysteryClient,
  type MysteryJudge,
} from "./index.ts";

type Role = "answer" | "distractor1" | "distractor2" | "distractor3";

interface Step {
  intent: "guess" | "next_clue" | "pick";
  entity?: string;
  option?: string;
  expect: {
    verdict?: "continue" | "resolved";
    error?: string;
    clue?: number;
    options?: boolean;
    disabled?: string[];
  };
}

interface Row {
  id: string;
  title: string;
  optionsFromClue: number;
  steps: Step[];
  outcome: {
    solvedOn: 1 | 2 | 3 | 4 | null;
    points: number;
    cells: string[];
  } | null;
}

function entity(text: string): EntityId {
  const id = parseEntityId(text);
  if (id === null) throw new Error(`bad entity id ${text}`);
  return id;
}

function item(text: string): ItemId {
  const id = parseItemId(text);
  if (id === null) throw new Error(`bad item id ${text}`);
  return id;
}

const NOT_ON_THE_LIST = "fx.x.country.not-on-the-list";

const content: MysteryContent = {
  id: item("fx.m.geo.0101"),
  category: "geo",
  tags: [],
  region: "global",
  volatility: "evergreen",
  reviewBy: null,
  seededDifficulty: 2,
  explanation: "Parity explanation.",
  learnMore: "Arvenna (fixture)",
  kind: "mystery",
  answerType: "country",
  answer: entity(table.mystery.answer),
  accepted: table.mystery.accepted.map(entity),
  // The table carries no clue text; any four will do.
  clues: [
    "Parity clue 1.",
    "Parity clue 2.",
    "Parity clue 3.",
    "Parity clue 4.",
  ],
  distractors: table.mystery.distractors.map(entity) as [
    EntityId,
    EntityId,
    EntityId,
  ],
  slot: 1,
  predicted: {
    solveByClue: [0.2, 0.4, 0.6, 0.8],
    spread: 0.1,
    estimator: "v0",
  },
  sourceLabels: [],
};

/** Every id the table names is on the list, except the one meant to be missing. */
function lookupForTable(): EntityLookup {
  const ids = new Set<string>([
    table.mystery.answer,
    ...table.mystery.accepted,
    ...table.mystery.distractors,
  ]);
  for (const row of table.rows as Row[]) {
    for (const step of row.steps) if (step.entity) ids.add(step.entity);
  }
  ids.delete(NOT_ON_THE_LIST);
  const records = new Map<string, EntityRecord>();
  for (const text of ids) {
    const slug = text.split(".").at(-1) ?? text;
    const display = slug.charAt(0).toUpperCase() + slug.slice(1);
    records.set(text, { id: entity(text), display, optionLabel: display });
  }
  return { get: (id) => records.get(id) ?? null };
}

const lookup = lookupForTable();

const meta: RoundMeta = {
  index: 0,
  type: "mystery",
  difficulty: "easy",
  category: "geo",
  answerType: "country",
  ordinal: 1,
  ofType: 3,
  maxPoints: 4,
  voided: false,
};

const SOURCE: Readonly<Record<Role, number>> = {
  answer: 0,
  distractor1: 1,
  distractor2: 2,
  distractor3: 3,
};

function roleAt(judge: MysteryJudge, index: number): Role {
  const source = judge.order[index];
  const role = (Object.keys(SOURCE) as Role[]).find(
    (r) => SOURCE[r] === source,
  );
  if (role === undefined) throw new Error(`no role at ${index}`);
  return role;
}

function intentFor(step: Step, judge: MysteryJudge): RoundIntent {
  switch (step.intent) {
    case "guess":
      return {
        family: "mystery",
        kind: "guess",
        entityId: entity(step.entity ?? ""),
      };
    case "next_clue":
      return { family: "mystery", kind: "next_clue" };
    case "pick":
      return {
        family: "mystery",
        kind: "pick",
        option: judge.order.indexOf(SOURCE[step.option as Role]),
      };
  }
}

/** Plays a row; returns the final client so the caller can read its outcome. */
function play(
  row: Row,
  seed: string,
): { client: MysteryClient; judge: MysteryJudge } {
  const ctx = (at: number): JudgeContext => ({
    at,
    rng: createRng(seed),
    shuffle: null,
    optionsFromClue: row.optionsFromClue as 3 | 4,
    entities: lookup,
  });
  const opened = mysteryPlugin.open(content, meta, ctx(1000));
  let judge = opened.judge;
  let client = mysteryPlugin.init(opened.open);
  expect(opened.open).toMatchObject({
    clue: 1,
    options: null,
    wrongGuesses: [],
  });

  row.steps.forEach((step, n) => {
    const intent = intentFor(step, judge);
    const check = mysteryPlugin.check(
      client,
      intent as Extract<RoundIntent, { family: "mystery" }>,
    );
    const result = mysteryPlugin.judge(
      content,
      judge,
      intent as Extract<RoundIntent, { family: "mystery" }>,
      ctx(2000 + n * 1000),
    );
    if (step.expect.error !== undefined) {
      expect(result, `${row.id} step ${n + 1}`).toEqual({
        ok: false,
        error: step.expect.error,
      });
      // A refusal consumes nothing.
      expect(judge.clue).toBe(step.expect.clue);
      // The device refuses the same intents, except ids it can't know are off the list.
      if (step.expect.error !== "invalid_entity") expect(check.ok).toBe(false);
      return;
    }
    expect(check, `${row.id} step ${n + 1} client check`).toEqual({ ok: true });
    if (!result.ok) throw new Error(`${row.id} step ${n + 1}: ${result.error}`);
    judge = result.judge;
    expect(result.verdict.kind).toBe(step.expect.verdict);
    client = mysteryPlugin.apply(client, result.verdict);
    if (result.verdict.kind === "continue") {
      const open = result.verdict.open;
      if (open.family !== "mystery") throw new Error("not a mystery open");
      expect(open.clue).toBe(step.expect.clue);
      expect(open.clues).toHaveLength(open.clue);
      expect(open.options !== null).toBe(step.expect.options);
      if (step.expect.disabled !== undefined) {
        const disabled = (open.options ?? [])
          .filter((o) => o.alreadyGuessed)
          .map((o) => roleAt(judge, o.index))
          .sort();
        expect(disabled).toEqual([...step.expect.disabled].sort());
      }
    }
  });
  return { client, judge };
}

const rows = table.rows as Row[];

describe("the mystery scoring table (PRD §4.1.7, mystery-scoring.json)", () => {
  it.each(rows.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    // Two shuffles: the outcome never depends on where the key sits.
    for (const seed of [`${row.id}:a`, `${row.id}:b`, `${row.id}:c`]) {
      const { client, judge } = play(row, seed);
      const outcome = mysteryPlugin.outcome(client, meta);
      if (row.outcome === null) {
        expect(outcome).toBeNull();
        expect(judge.result).toBeNull();
      } else {
        expect(outcome).toEqual({
          family: "mystery",
          solvedOn: row.outcome.solvedOn,
          points: row.outcome.points,
          voided: false,
          category: "geo",
          cells: row.outcome.cells,
        });
        expect(judge.result?.solvedOn).toBe(row.outcome.solvedOn);
      }
    }
  });

  it("covers both PRD tables and the refusals", () => {
    const ids = rows.map((row) => row.id);
    expect(rows.filter((row) => row.optionsFromClue === 3)).toHaveLength(5);
    expect(ids).toContain("same-guess-twice");
    expect(ids).toContain("guess-not-on-the-list");
    const errors = new Set(
      rows.flatMap((row) => row.steps.map((step) => step.expect.error)),
    );
    expect(errors).toEqual(
      new Set([
        undefined,
        "already_guessed",
        "invalid_entity",
        "invalid_input",
        "stale",
      ]),
    );
  });

  it("AC-DLY-36 options_from_clue 3 plays and scores with no code change (engine)", () => {
    const fromThree = rows.filter((row) => row.optionsFromClue === 3);
    const expected = new Map<string, number>([
      ["options-from-3-next-next-pick-right", 2],
      ["options-from-3-wrong-next-wrong-pick-then-right", 1],
      ["options-from-3-next-three-times-pick-right", 1],
      ["options-from-3-two-wrong-picks", 0],
    ]);
    for (const row of fromThree) {
      const { client } = play(row, `${row.id}:ac`);
      const outcome = mysteryPlugin.outcome(client, meta);
      if (expected.has(row.id)) {
        expect(outcome?.points, row.id).toBe(expected.get(row.id));
        expect(outcome?.cells, row.id).toEqual(row.outcome?.cells);
      }
    }
    // Options replace typing from clue 3, and a wrong pick there disables it on clue 4.
    const wrongPick = fromThree.find(
      (row) => row.id === "options-from-3-wrong-next-wrong-pick-then-right",
    );
    expect(wrongPick?.steps[2]?.expect).toEqual({
      verdict: "continue",
      clue: 4,
      options: true,
      disabled: ["distractor1"],
    });
  });
});
