// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createRng } from "../rng.ts";
import { parseEntityId, type EntityId } from "../types/ids.ts";
import { ROUND_FAMILY, ROUND_TYPES, type RoundMeta } from "../types/rounds.ts";
import {
  PLUGINS,
  UnsupportedRoundTypeError,
  pluginFor,
} from "./index.ts";
import {
  createEchoRegistry,
  echoChoicePlugin,
  echoEncorePlugin,
  echoMysteryPlugin,
  echoPluginFor,
} from "./testing/echo.ts";
import type { EntityLookup, JudgeContext } from "./types.ts";

const meta = (type: RoundMeta["type"]): RoundMeta => ({
  index: 0,
  type,
  difficulty: null,
  category: "geo",
  answerType: type === "mystery" ? "country" : null,
  ordinal: 1,
  ofType: 1,
  maxPoints: type === "mystery" ? 4 : type === "encore" ? 0 : 1,
  voided: false,
});

function id(text: string): EntityId {
  const parsed = parseEntityId(text);
  if (parsed === null) throw new Error(text);
  return parsed;
}

function ctx(options: Partial<JudgeContext> = {}): JudgeContext {
  return {
    at: 1000,
    rng: createRng("ctx"),
    shuffle: null,
    optionsFromClue: 4,
    entities: null,
    ...options,
  };
}

describe("the plugin registry", () => {
  it("has a plugin for every round type, of the type's family", () => {
    for (const type of ROUND_TYPES) {
      const plugin = PLUGINS[type];
      expect(plugin.family).toBe(ROUND_FAMILY[type]);
      expect(plugin.types).toContain(type);
      expect(pluginFor(type)).toBe(plugin);
    }
  });

  it("states each family's maximum points", () => {
    expect(PLUGINS.mc.maxPoints(meta("mc"))).toBe(1);
    expect(PLUGINS.tf.maxPoints(meta("tf"))).toBe(1);
    expect(PLUGINS.comparison.maxPoints(meta("comparison"))).toBe(1);
    expect(PLUGINS.mystery.maxPoints(meta("mystery"))).toBe(4);
    expect(PLUGINS.encore.maxPoints(meta("encore"))).toBe(0);
  });

  it("refuses ordering rounds with unsupported_round_type", () => {
    const attempt = () => PLUGINS.ordering.maxPoints(meta("ordering"));
    expect(attempt).toThrow(UnsupportedRoundTypeError);
    try {
      attempt();
    } catch (error) {
      expect((error as UnsupportedRoundTypeError).code).toBe(
        "unsupported_round_type",
      );
    }
  });
});

describe("the echo test plugin", () => {
  it("covers every family through its registry", () => {
    const registry = createEchoRegistry();
    expect(registry.mc).toBe(echoChoicePlugin);
    expect(registry.mystery).toBe(echoMysteryPlugin);
    expect(registry.encore).toBe(echoEncorePlugin);
    expect(echoPluginFor("choice")).toBe(echoChoicePlugin);
    expect(echoPluginFor("mystery")).toBe(echoMysteryPlugin);
    expect(echoPluginFor("encore")).toBe(echoEncorePlugin);
    expect(echoPluginFor("ordering")).toBe(registry.ordering);
  });

  it("opens and judges a choice round", () => {
    const { open, judge } = echoChoicePlugin.open(
      { correct: 1, optionCount: 3 },
      meta("tf"),
      ctx(),
    );
    expect(open).toMatchObject({ family: "choice", format: "tf" });
    expect(open.options).toHaveLength(3);
    const client = echoChoicePlugin.init(open);
    expect(
      echoChoicePlugin.check(client, {
        family: "choice",
        kind: "answer",
        option: 5,
      }),
    ).toEqual({
      ok: false,
      error: "not_selectable",
    });
    expect(
      echoChoicePlugin.judge(
        { optionCount: 3 },
        judge,
        { family: "choice", kind: "answer", option: 7 },
        ctx(),
      ),
    ).toEqual({ ok: false, error: "invalid_input" });
    const result = echoChoicePlugin.judge(
      { correct: 1 },
      judge,
      { family: "choice", kind: "answer", option: 1 },
      ctx(),
    );
    if (!result.ok) throw new Error("judge failed");
    const resolved = echoChoicePlugin.apply(client, result.verdict);
    expect(echoChoicePlugin.outcome(resolved, meta("mc"))).toMatchObject({
      correct: true,
      points: 1,
    });
    expect(
      echoChoicePlugin.check(resolved, {
        family: "choice",
        kind: "answer",
        option: 0,
      }),
    ).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(echoChoicePlugin.outcome(client, meta("mc"))).toBeNull();
  });

  it("judges mystery refusals the way the real rules do", () => {
    const answer = id("fx.x.country.arvenna");
    const known: EntityLookup = {
      get: (entityId) =>
        entityId === answer || entityId === id("fx.x.country.belloria")
          ? { id: entityId, display: "Belloria", optionLabel: "Belloria" }
          : null,
    };
    const content = { answer, correct: 0 };
    const { judge } = echoMysteryPlugin.open(content, meta("mystery"), ctx());
    expect(
      echoMysteryPlugin.judge(
        content,
        judge,
        {
          family: "mystery",
          kind: "guess",
          entityId: id("fx.x.country.nowhere"),
        },
        ctx({ entities: known }),
      ),
    ).toEqual({ ok: false, error: "invalid_entity" });
    expect(
      echoMysteryPlugin.judge(
        content,
        judge,
        { family: "mystery", kind: "pick", option: 0 },
        ctx(),
      ),
    ).toEqual({ ok: false, error: "invalid_input" });
    const wrong = echoMysteryPlugin.judge(
      content,
      judge,
      {
        family: "mystery",
        kind: "guess",
        entityId: id("fx.x.country.belloria"),
      },
      ctx({ entities: known }),
    );
    if (!wrong.ok) throw new Error("wrong guess refused");
    expect(wrong.verdict.kind).toBe("continue");
    expect(
      echoMysteryPlugin.judge(
        content,
        wrong.judge,
        {
          family: "mystery",
          kind: "guess",
          entityId: id("fx.x.country.belloria"),
        },
        ctx(),
      ),
    ).toEqual({ ok: false, error: "already_guessed" });
  });

  it("brings the options forward with optionsFromClue 3 and disables a wrong pick", () => {
    const content = { correct: 2 };
    const three = ctx({ optionsFromClue: 3 });
    let state = echoMysteryPlugin.open(content, meta("mystery"), three).judge;
    for (let i = 0; i < 2; i += 1) {
      const next = echoMysteryPlugin.judge(
        content,
        state,
        { family: "mystery", kind: "next_clue" },
        three,
      );
      if (!next.ok) throw new Error("next clue refused");
      state = next.judge;
    }
    expect(state.clue).toBe(3);
    const pick = echoMysteryPlugin.judge(
      content,
      state,
      { family: "mystery", kind: "pick", option: 1 },
      three,
    );
    if (!pick.ok || pick.verdict.kind !== "continue")
      throw new Error("wrong pick should continue");
    expect(pick.verdict.open).toMatchObject({ clue: 4 });
    const open = pick.verdict.open;
    expect(
      open.family === "mystery" ? open.options?.[1]?.alreadyGuessed : null,
    ).toBe(true);
    expect(
      echoMysteryPlugin.judge(
        content,
        pick.judge,
        { family: "mystery", kind: "pick", option: 1 },
        three,
      ),
    ).toEqual({ ok: false, error: "already_guessed" });
    const right = echoMysteryPlugin.judge(
      content,
      pick.judge,
      { family: "mystery", kind: "pick", option: 2 },
      three,
    );
    if (!right.ok || right.verdict.kind !== "resolved")
      throw new Error("right pick should resolve");
    expect(right.verdict.reveal).toMatchObject({ solvedOn: 4, points: 1 });
    expect(
      echoMysteryPlugin.judge(
        content,
        pick.judge,
        { family: "mystery", kind: "next_clue" },
        three,
      ),
    ).toEqual({ ok: false, error: "invalid_input" });
  });

  it("checks mystery intents on the device", () => {
    const { open } = echoMysteryPlugin.open({}, meta("mystery"), ctx());
    const client = echoMysteryPlugin.init(open);
    expect(
      echoMysteryPlugin.check(client, {
        family: "mystery",
        kind: "pick",
        option: 0,
      }),
    ).toEqual({
      ok: false,
      error: "not_selectable",
    });
    expect(
      echoMysteryPlugin.check(client, { family: "mystery", kind: "next_clue" }),
    ).toEqual({ ok: true });
  });

  it("judges an encore lock-in", () => {
    const { open, judge } = echoEncorePlugin.open(
      { value: 200 },
      meta("encore"),
      ctx(),
    );
    const client = echoEncorePlugin.init(open);
    expect(
      echoEncorePlugin.check(client, {
        family: "encore",
        kind: "lock_in",
        value: 0,
      }),
    ).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(
      echoEncorePlugin.judge(
        { value: 200 },
        judge,
        { family: "encore", kind: "lock_in", value: -1 },
        ctx(),
      ),
    ).toEqual({
      ok: false,
      error: "invalid_input",
    });
    const result = echoEncorePlugin.judge(
      { value: 200 },
      judge,
      { family: "encore", kind: "lock_in", value: 205 },
      ctx(),
    );
    if (!result.ok || result.verdict.kind !== "resolved")
      throw new Error("lock-in refused");
    expect(result.verdict.reveal).toMatchObject({
      family: "encore",
      band: "bullseye",
    });
    const resolved = echoEncorePlugin.apply(client, result.verdict);
    expect(echoEncorePlugin.outcome(resolved, meta("encore"))).toMatchObject({
      band: "bullseye",
    });
    expect(echoEncorePlugin.announce(client, result.verdict)).toMatchObject({
      kind: "encore_result",
    });
  });
});
