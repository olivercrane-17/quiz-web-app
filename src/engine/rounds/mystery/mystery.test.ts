// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createRng } from "../../rng.ts";
import type { MysteryContent } from "../../types/content.ts";
import {
  parseEntityId,
  parseItemId,
  type EntityId,
  type ItemId,
} from "../../types/ids.ts";
import type { RoundMeta, RoundVerdict } from "../../types/rounds.ts";
import { PLUGINS } from "../index.ts";
import type { EntityLookup, EntityRecord, JudgeContext } from "../types.ts";
import {
  isOptionOrder,
  mysteryOpenOf,
  mysteryPlugin,
  mysteryVerdictOf,
  optionLabels,
  showsBracket,
  type MysteryJudge,
} from "./index.ts";

function entity(text: string): EntityId {
  const id = parseEntityId(text);
  if (id === null) throw new Error(text);
  return id;
}

function item(text: string): ItemId {
  const id = parseItemId(text);
  if (id === null) throw new Error(text);
  return id;
}

const ADA = entity("fx.x.person.ada-morrow-cartographer");
const ADA_SCULPTOR = entity("fx.x.person.ada-morrow-sculptor");
const ODILE = entity("fx.x.person.odile-marsh");
const CORIN = entity("fx.x.person.corin-ashby");
const MIRA = entity("fx.x.person.mira-tolland");
const LIESL = entity("fx.x.person.liesl-varo");

const records: EntityRecord[] = [
  {
    id: ODILE,
    display: "Odile Marsh",
    optionLabel: "Odile Marsh (cartographer)",
  },
  {
    id: CORIN,
    display: "Corin Ashby",
    optionLabel: "Corin Ashby (clockmaker)",
  },
  { id: MIRA, display: "Mira Tolland", optionLabel: "Mira Tolland (scholar)" },
  { id: LIESL, display: "Liesl Varo", optionLabel: "Liesl Varo (painter)" },
  {
    id: ADA,
    display: "Ada Morrow (cartographer)",
    optionLabel: "Ada Morrow (cartographer)",
  },
  {
    id: ADA_SCULPTOR,
    display: "Ada Morrow (sculptor)",
    optionLabel: "Ada Morrow (sculptor)",
  },
];

const lookup: EntityLookup = {
  get: (id) => records.find((r) => r.id === id) ?? null,
};

function mystery(overrides: Partial<MysteryContent> = {}): MysteryContent {
  return {
    id: item("fx.m.hist.0101"),
    category: "hist",
    tags: [],
    region: "global",
    volatility: "evergreen",
    reviewBy: null,
    seededDifficulty: 2,
    explanation: "She mapped the coast.",
    learnMore: "Odile Marsh (fixture)",
    kind: "mystery",
    answerType: "person",
    answer: ODILE,
    accepted: [],
    clues: ["Clue one.", "Clue two.", "Clue three.", "Clue four."],
    distractors: [CORIN, MIRA, LIESL],
    slot: 1,
    predicted: {
      solveByClue: [0.2, 0.4, 0.6, 0.8],
      spread: 0.1,
      estimator: "v0",
    },
    sourceLabels: ["Fixture atlas"],
    ...overrides,
  };
}

const meta: RoundMeta = {
  index: 2,
  type: "mystery",
  difficulty: "hard",
  category: "hist",
  answerType: "person",
  ordinal: 3,
  ofType: 3,
  maxPoints: 4,
  voided: false,
};

function ctx(overrides: Partial<JudgeContext> = {}): JudgeContext {
  return {
    at: 5000,
    rng: createRng("mystery-test"),
    shuffle: [2, 0, 3, 1],
    optionsFromClue: 4,
    entities: lookup,
    ...overrides,
  };
}

function toClue4(content = mystery(), context = ctx()): MysteryJudge {
  let { judge } = mysteryPlugin.open(content, meta, context);
  for (let i = 0; i < 3; i += 1) {
    const result = mysteryPlugin.judge(
      content,
      judge,
      { family: "mystery", kind: "next_clue" },
      context,
    );
    if (!result.ok) throw new Error(result.error);
    judge = result.judge;
  }
  return judge;
}

describe("the mystery plugin", () => {
  it("is the registry's mystery plugin, worth 4", () => {
    expect(PLUGINS.mystery).toBe(mysteryPlugin);
    expect(mysteryPlugin.maxPoints(meta)).toBe(4);
  });

  it("opens on clue 1 with no options and nothing of the key", () => {
    const { open, judge } = mysteryPlugin.open(mystery(), meta, ctx());
    expect(open).toEqual({
      family: "mystery",
      index: 2,
      clue: 1,
      clues: ["Clue one."],
      wrongGuesses: [],
      options: null,
      issuedAt: 5000,
    });
    expect(JSON.stringify(open)).not.toContain("odile");
    expect(judge).toMatchObject({
      clue: 1,
      order: [2, 0, 3, 1],
      issuedAt: [5000],
    });
  });

  it("shows the four options in the stored shuffle, naming no entity id", () => {
    const judge = toClue4();
    const open = mysteryOpenOf(mystery(), judge, ctx());
    // order [2, 0, 3, 1]: Mira, Odile (the key), Liesl, Corin.
    expect(open.options?.map((o) => o.label)).toEqual([
      "Mira Tolland",
      "Odile Marsh",
      "Liesl Varo",
      "Corin Ashby",
    ]);
    expect(JSON.stringify(open.options)).not.toContain("fx.x.");
  });

  it("draws the order from the round's rng when nothing is stored", () => {
    const a = mysteryPlugin.open(mystery(), meta, ctx({ shuffle: null }));
    const b = mysteryPlugin.open(mystery(), meta, ctx({ shuffle: null }));
    expect(isOptionOrder(a.judge.order)).toBe(true);
    expect(a.judge.order).toEqual(b.judge.order);
  });

  it("refuses a stored shuffle that isn't a permutation", () => {
    expect(() =>
      mysteryPlugin.open(mystery(), meta, ctx({ shuffle: [0, 0, 1, 2] })),
    ).toThrow(RangeError);
  });

  it("labels all four with their descriptors when any display shows a bracket (§5.5)", () => {
    const content = mystery({ distractors: [CORIN, ADA_SCULPTOR, LIESL] });
    const labels = optionLabels(content, [0, 1, 2, 3], lookup);
    expect(labels).toEqual([
      "Odile Marsh (cartographer)",
      "Corin Ashby (clockmaker)",
      "Ada Morrow (sculptor)",
      "Liesl Varo (painter)",
    ]);
    expect(labels.every(showsBracket)).toBe(true);
    // Without a bracket anywhere, the plain displays show.
    expect(
      optionLabels(mystery(), [0, 1, 2, 3], lookup).some(showsBracket),
    ).toBe(false);
  });

  it("can't label options without the list, or with an entity off it", () => {
    expect(() => optionLabels(mystery(), [0, 1, 2, 3], null)).toThrow(
      /answer list/,
    );
    const gone = mystery({
      distractors: [CORIN, MIRA, entity("fx.x.person.retired-one")],
    });
    expect(() => optionLabels(gone, [0, 1, 2, 3], lookup)).toThrow(
      /not an active list entry/,
    );
  });

  it("treats every guess as invalid_entity without a list", () => {
    const { judge } = mysteryPlugin.open(mystery(), meta, ctx());
    expect(
      mysteryPlugin.judge(
        mystery(),
        judge,
        { family: "mystery", kind: "guess", entityId: ODILE },
        ctx({ entities: null }),
      ),
    ).toEqual({ ok: false, error: "invalid_entity" });
  });

  it("records each wrong guess on the clue it was made on, with its display", () => {
    const content = mystery();
    let { judge } = mysteryPlugin.open(content, meta, ctx());
    const first = mysteryPlugin.judge(
      content,
      judge,
      { family: "mystery", kind: "guess", entityId: CORIN },
      ctx({ at: 6000 }),
    );
    if (!first.ok) throw new Error(first.error);
    judge = first.judge;
    expect(judge.wrongGuesses).toEqual([
      { clue: 1, entityId: CORIN, display: "Corin Ashby" },
    ]);
    expect(judge.issuedAt).toEqual([5000, 6000]);
    const verdict = first.verdict;
    if (verdict.kind !== "continue" || verdict.open.family !== "mystery")
      throw new Error();
    expect(verdict.open).toMatchObject({
      clue: 2,
      clues: ["Clue one.", "Clue two."],
      issuedAt: 6000,
    });
  });

  it("reveals everything on resolution, and nothing more after it", () => {
    const content = mystery();
    const { judge } = mysteryPlugin.open(content, meta, ctx());
    const solved = mysteryPlugin.judge(
      content,
      judge,
      { family: "mystery", kind: "guess", entityId: ODILE },
      ctx(),
    );
    if (!solved.ok) throw new Error(solved.error);
    expect(solved.verdict).toEqual({
      kind: "resolved",
      reveal: {
        family: "mystery",
        answer: { entityId: ODILE, display: "Odile Marsh" },
        clues: ["Clue one.", "Clue two.", "Clue three.", "Clue four."],
        solvedOn: 1,
        points: 4,
        pickedOption: null,
        explanation: "She mapped the coast.",
        learnMore: "Odile Marsh (fixture)",
        sourceLabels: ["Fixture atlas"],
        crowd: null,
      },
      next: null,
    });
    expect(
      mysteryPlugin.judge(
        content,
        solved.judge,
        { family: "mystery", kind: "next_clue" },
        ctx(),
      ),
    ).toEqual({ ok: false, error: "stale" });
  });

  it("records the picked option, right or wrong", () => {
    const content = mystery();
    const judge = toClue4();
    const wrong = mysteryPlugin.judge(
      content,
      judge,
      { family: "mystery", kind: "pick", option: 0 },
      ctx(),
    );
    if (!wrong.ok || wrong.verdict.kind !== "resolved") throw new Error();
    expect(wrong.verdict.reveal).toMatchObject({
      solvedOn: null,
      points: 0,
      pickedOption: 0,
    });
    const right = mysteryPlugin.judge(
      content,
      judge,
      { family: "mystery", kind: "pick", option: 1 },
      ctx(),
    );
    if (!right.ok || right.verdict.kind !== "resolved") throw new Error();
    expect(right.verdict.reveal).toMatchObject({
      solvedOn: 4,
      points: 1,
      pickedOption: 1,
    });
  });

  it("refuses an option index that isn't one of the four", () => {
    const judge = toClue4();
    for (const option of [-1, 4, 1.5]) {
      expect(
        mysteryPlugin.judge(
          mystery(),
          judge,
          { family: "mystery", kind: "pick", option },
          ctx(),
        ),
      ).toEqual({ ok: false, error: "invalid_input" });
    }
  });

  it("rebuilds the response to a replayed key from the current state (§8.8)", () => {
    const content = mystery();
    const { judge } = mysteryPlugin.open(content, meta, ctx());
    const first = mysteryPlugin.judge(
      content,
      judge,
      { family: "mystery", kind: "guess", entityId: MIRA },
      ctx(),
    );
    if (!first.ok) throw new Error(first.error);
    expect(mysteryVerdictOf(content, first.judge, ctx())).toEqual(
      first.verdict,
    );
    const solved = mysteryPlugin.judge(
      content,
      first.judge,
      { family: "mystery", kind: "guess", entityId: ODILE },
      ctx(),
    );
    if (!solved.ok) throw new Error(solved.error);
    expect(mysteryVerdictOf(content, solved.judge, ctx())).toEqual(
      solved.verdict,
    );
  });
});

describe("the mystery client half", () => {
  function clue2WithGuess() {
    const content = mystery();
    const { open, judge } = mysteryPlugin.open(content, meta, ctx());
    const client = mysteryPlugin.init(open);
    const result = mysteryPlugin.judge(
      content,
      judge,
      { family: "mystery", kind: "guess", entityId: CORIN },
      ctx(),
    );
    if (!result.ok) throw new Error(result.error);
    return { client, verdict: result.verdict, judge: result.judge, content };
  }

  it("rebuilds its state from a resumed open, earlier guesses included (AC-DLY-07)", () => {
    const { verdict } = clue2WithGuess();
    if (verdict.kind !== "continue") throw new Error();
    const resumed = mysteryPlugin.init(verdict.open as never);
    expect(resumed.guessed).toEqual([CORIN]);
    expect(
      mysteryPlugin.check(resumed, {
        family: "mystery",
        kind: "guess",
        entityId: CORIN,
      }),
    ).toEqual({ ok: false, error: "already_guessed" });
  });

  it("refuses repeats, typing once options show, and anything after the reveal", () => {
    const { client, verdict } = clue2WithGuess();
    const after = mysteryPlugin.apply(client, verdict);
    expect(
      mysteryPlugin.check(after, {
        family: "mystery",
        kind: "guess",
        entityId: CORIN,
      }),
    ).toEqual({ ok: false, error: "already_guessed" });
    expect(
      mysteryPlugin.check(after, {
        family: "mystery",
        kind: "guess",
        entityId: MIRA,
      }),
    ).toEqual({
      ok: true,
    });
    expect(
      mysteryPlugin.check(after, {
        family: "mystery",
        kind: "pick",
        option: 0,
      }),
    ).toEqual({
      ok: false,
      error: "not_selectable",
    });

    const clue4 = mysteryPlugin.init(
      mysteryOpenOf(mystery(), toClue4(), ctx()),
    );
    expect(
      mysteryPlugin.check(clue4, {
        family: "mystery",
        kind: "guess",
        entityId: MIRA,
      }),
    ).toEqual({ ok: false, error: "not_selectable" });
    expect(
      mysteryPlugin.check(clue4, { family: "mystery", kind: "next_clue" }),
    ).toEqual({
      ok: false,
      error: "not_selectable",
    });
    expect(
      mysteryPlugin.check(clue4, {
        family: "mystery",
        kind: "pick",
        option: 3,
      }),
    ).toEqual({
      ok: true,
    });

    const revealed = mysteryPlugin.apply(clue4, {
      kind: "resolved",
      reveal: {
        family: "withdrawn",
        round: "mystery",
        points: 4,
        maxPoints: 4,
      },
      next: null,
    });
    expect(
      mysteryPlugin.check(revealed, {
        family: "mystery",
        kind: "pick",
        option: 3,
      }),
    ).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });

  it("marks a typed distractor as already guessed among the options", () => {
    const content = mystery();
    let { judge } = mysteryPlugin.open(content, meta, ctx());
    for (const intent of [
      { family: "mystery", kind: "guess", entityId: LIESL },
      { family: "mystery", kind: "next_clue" },
      { family: "mystery", kind: "next_clue" },
    ] as const) {
      const result = mysteryPlugin.judge(content, judge, intent, ctx());
      if (!result.ok) throw new Error(result.error);
      judge = result.judge;
    }
    const open = mysteryOpenOf(content, judge, ctx());
    // order [2, 0, 3, 1]: Liesl (source 3) sits at display index 2.
    expect(open.options?.find((o) => o.alreadyGuessed)).toEqual({
      index: 2,
      label: "Liesl Varo",
      alreadyGuessed: true,
    });
    const client = mysteryPlugin.init(open);
    expect(
      mysteryPlugin.check(client, {
        family: "mystery",
        kind: "pick",
        option: 2,
      }),
    ).toEqual({
      ok: false,
      error: "already_guessed",
    });
  });

  it("announces a wrong guess, Next clue, a wrong early pick, a solve and a miss as data", () => {
    const { client, verdict } = clue2WithGuess();
    expect(mysteryPlugin.announce(client, verdict)).toEqual({
      kind: "wrong_guess",
      guess: "Corin Ashby",
      clue: 2,
      clueText: "Clue two.",
    });

    const content = mystery();
    const { open, judge } = mysteryPlugin.open(content, meta, ctx());
    const next = mysteryPlugin.judge(
      content,
      judge,
      { family: "mystery", kind: "next_clue" },
      ctx(),
    );
    if (!next.ok) throw new Error(next.error);
    expect(
      mysteryPlugin.announce(mysteryPlugin.init(open), next.verdict),
    ).toEqual({
      kind: "next_clue",
      clue: 2,
      clueText: "Clue two.",
    });

    // options_from_clue 3: a wrong pick on clue 3 reads as a wrong guess.
    const three = ctx({ optionsFromClue: 3 });
    let j3 = mysteryPlugin.open(content, meta, three).judge;
    for (let i = 0; i < 2; i += 1) {
      const r = mysteryPlugin.judge(
        content,
        j3,
        { family: "mystery", kind: "next_clue" },
        three,
      );
      if (!r.ok) throw new Error(r.error);
      j3 = r.judge;
    }
    const before = mysteryPlugin.init(mysteryOpenOf(content, j3, three));
    const pick = mysteryPlugin.judge(
      content,
      j3,
      { family: "mystery", kind: "pick", option: 0 },
      three,
    );
    if (!pick.ok) throw new Error(pick.error);
    expect(mysteryPlugin.announce(before, pick.verdict)).toEqual({
      kind: "wrong_guess",
      guess: "Mira Tolland",
      clue: 4,
      clueText: "Clue four.",
    });

    const solved: RoundVerdict = {
      kind: "resolved",
      reveal: {
        family: "mystery",
        answer: { entityId: ODILE, display: "Odile Marsh" },
        clues: ["a", "b", "c", "d"],
        solvedOn: 2,
        points: 3,
        pickedOption: null,
        explanation: "",
        learnMore: "",
        sourceLabels: [],
        crowd: null,
      },
      next: null,
    };
    expect(mysteryPlugin.announce(client, solved)).toEqual({
      kind: "mystery_solved",
      answer: "Odile Marsh",
      clue: 2,
      points: 3,
    });
    if (solved.reveal.family !== "mystery") throw new Error();
    expect(
      mysteryPlugin.announce(client, {
        ...solved,
        reveal: { ...solved.reveal, solvedOn: null, points: 0 },
      }),
    ).toEqual({ kind: "mystery_missed", answer: "Odile Marsh" });
    expect(
      mysteryPlugin.announce(client, {
        kind: "resolved",
        reveal: {
          family: "withdrawn",
          round: "mystery",
          points: 4,
          maxPoints: 4,
        },
        next: null,
      }),
    ).toEqual({ kind: "mystery_missed", answer: "" });
  });

  it("reports the outcome with share cells, and a void as four voided cells", () => {
    const { client } = clue2WithGuess();
    expect(mysteryPlugin.outcome(client, meta)).toBeNull();
    const withdrawn = mysteryPlugin.apply(client, {
      kind: "resolved",
      reveal: {
        family: "withdrawn",
        round: "mystery",
        points: 4,
        maxPoints: 4,
      },
      next: null,
    });
    expect(mysteryPlugin.outcome(withdrawn, meta)).toEqual({
      family: "mystery",
      solvedOn: null,
      points: 4,
      voided: true,
      category: "hist",
      cells: ["voided", "voided", "voided", "voided"],
    });
    expect(() =>
      mysteryPlugin.outcome(withdrawn, { ...meta, category: null }),
    ).toThrow(RangeError);
  });

  it("ignores verdicts of another family", () => {
    const { client } = clue2WithGuess();
    expect(
      mysteryPlugin.apply(client, {
        kind: "continue",
        open: {
          family: "encore",
          index: 3,
          question: "",
          unit: "",
          unitShort: "",
          unitLabel: "",
          valueKind: "year",
          decimals: 0,
          issuedAt: 0,
        },
      }),
    ).toBe(client);
  });
});
