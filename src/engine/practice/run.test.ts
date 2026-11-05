// @vitest-environment node
import { describe, expect, it } from "vitest";

import { choicePlugin, type ChoiceJudge } from "../rounds/choice/index.ts";
import { orderingPlugin } from "../rounds/ordering/index.ts";
import type { PluginRegistry } from "../rounds/types.ts";
import { createRun, reduceRun, toLocalSnapshot } from "../run/reducer.ts";
import { key } from "../run/testing.ts";
import type { RunCommand, RunEvent, RunState } from "../run/types.ts";
import { selectRunView } from "../run/view.ts";
import type { PracticeItem } from "../types/content.ts";
import type { RoundOpen } from "../types/rounds.ts";
import { planPracticeRun } from "./plan.ts";
import { practiceJudgeContext, practiceRunConfig } from "./rounds.ts";
import { localDate, syntheticPool } from "./testing.ts";

const PLUGINS: PluginRegistry = {
  mc: choicePlugin,
  tf: choicePlugin,
  comparison: choicePlugin,
  mystery: orderingPlugin,
  encore: orderingPlugin,
  ordering: orderingPlugin,
};

/** A tiny local controller: opens and judges rounds on the device, as the practice controller does. */
function drive(items: readonly PracticeItem[], runId: string) {
  const config = practiceRunConfig({ runId, items });
  const judges = new Map<number, ChoiceJudge>();
  let at = 1_000_000;
  let keys = 0;
  const persisted: number[] = [];
  let state: RunState;

  const run = (commands: RunCommand[]) => {
    for (const command of commands) {
      if (command.kind === "open_round") {
        const item = items[command.index] as PracticeItem;
        const meta = state.slots[command.index]?.meta;
        if (meta === undefined) throw new Error("no slot");
        const opened = choicePlugin.open(
          item,
          meta,
          practiceJudgeContext(config.seed, command.index, at),
        );
        judges.set(command.index, opened.judge);
        dispatch({
          type: "opened",
          at,
          index: command.index,
          open: opened.open,
        });
      } else if (command.kind === "judge") {
        const item = items[command.index] as PracticeItem;
        const judge = judges.get(command.index);
        if (judge === undefined || command.intent.family !== "choice") {
          throw new Error("no judge");
        }
        const result = choicePlugin.judge(
          item,
          judge,
          command.intent,
          practiceJudgeContext(config.seed, command.index, at),
        );
        if (!result.ok) throw new Error(result.error);
        judges.set(command.index, result.judge);
        dispatch({
          type: "verdict",
          at,
          key: command.key,
          verdict: result.verdict,
        });
      } else if (command.kind === "persist") {
        persisted.push(state.index);
      } else if (command.kind === "finish") {
        dispatch({ type: "finished", at, summary: null });
      }
    }
  };
  const dispatch = (event: RunEvent) => {
    const next = reduceRun(state, event, PLUGINS);
    state = next.state;
    run(next.commands);
  };
  const created = createRun(config, at);
  state = created.state;
  run(created.commands);

  return {
    get state() {
      return state;
    },
    persisted,
    judges,
    answer(option: number) {
      at += 2_000;
      keys += 1;
      dispatch({
        type: "intent",
        at,
        intent: { family: "choice", kind: "answer", option },
        key: key(keys),
      });
    },
    continue() {
      at += 3_000;
      dispatch({ type: "continue", at });
    },
    resume(snapshot: ReturnType<typeof toLocalSnapshot>) {
      at += 10_000;
      dispatch({ type: "resume", at, snapshot });
    },
  };
}

function plannedItems(seed: string): PracticeItem[] {
  return planPracticeRun(syntheticPool(), {
    mode: "quick",
    category: "mixed",
    difficulty: "mixed",
    length: 10,
    seed,
    today: localDate("2026-11-01"),
    seen: new Map(),
    denylist: new Set(),
    ability: null,
  }).items;
}

describe("a practice run on the run machine", () => {
  it("plays ten rounds judged on the device, one point per right answer, to finished", () => {
    const items = plannedItems("full-run");
    const game = drive(items, "run-full");
    let right = 0;
    for (let round = 0; round < 10; round += 1) {
      const judge = game.judges.get(round);
      expect(judge).toBeDefined();
      // Right on even rounds, wrong on odd ones.
      const option =
        round % 2 === 0
          ? (judge?.correct ?? 0)
          : ((judge?.correct ?? 0) + 1) % items[round]!.options.length;
      if (round % 2 === 0) right += 1;
      game.answer(option);
      const view = selectRunView(game.state, PLUGINS);
      expect(view.phase).toBe("revealed");
      expect(view.round?.outcome?.family).toBe("choice");
      expect(view.isLast).toBe(round === 9);
      game.continue();
    }
    expect(game.state.phase).toBe("finished");
    expect(game.state.score).toBe(right);
    expect(selectRunView(game.state, PLUGINS).maxPoints).toBe(10);
    // Local runs persist after every opened round and verdict (invariant 8).
    expect(game.persisted.length).toBeGreaterThanOrEqual(20);
  });

  it("resumes from its LocalRunSnapshot with the same options in the same order", () => {
    const items = plannedItems("resume-run");
    const first = drive(items, "run-resume");
    first.answer(0);
    first.continue();
    first.answer(1);
    first.continue();
    const optionsOf = (open: RoundOpen | null | undefined) =>
      open?.family === "choice" ? open.options : null;
    const shownBefore = optionsOf(first.state.slots[2]?.open);
    expect(shownBefore).toHaveLength(items[2]!.options.length);
    const snapshot = toLocalSnapshot(first.state);
    // A snapshot goes through JSON, as localStorage does.
    const stored = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;

    const second = drive(items, "run-resume");
    second.resume(stored);
    expect(second.state.phase).toBe("active");
    expect(second.state.index).toBe(2);
    expect(second.state.score).toBe(first.state.score);
    expect(optionsOf(second.state.slots[2]?.open)).toEqual(shownBefore);
    // Rebuilding the judge from the seed gives the key the player was shown.
    const rebuilt = choicePlugin.open(
      items[2]!,
      second.state.slots[2]!.meta,
      practiceJudgeContext("run-resume", 2, 0),
    );
    expect(rebuilt.open.options).toEqual(shownBefore);
  });
});
