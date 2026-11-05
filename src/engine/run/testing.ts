/**
 * Test helpers for the run machine: round metadata, configs and a small
 * controller that judges locally with the echo plugins, so reducer tests
 * read as the flows they check. Tests only.
 */
import { createRng } from "../rng.ts";
import type { EchoContent } from "../rounds/testing/echo.ts";
import { createEchoRegistry } from "../rounds/testing/echo.ts";
import type { JudgeContext, PluginRegistry } from "../rounds/types.ts";
import type { CategoryId } from "../types/content.ts";
import {
  parseIdempotencyKey,
  type EpochMs,
  type IdempotencyKey,
} from "../types/ids.ts";
import type { RoundIntent, RoundMeta, RoundType } from "../types/rounds.ts";
import type { RunConfig } from "../types/runs.ts";
import { createRun, reduceRun } from "./reducer.ts";
import type { RunCommand, RunEvent, RunState } from "./types.ts";

const MAX_POINTS: Record<RoundType, number> = {
  mc: 1,
  tf: 1,
  comparison: 1,
  mystery: 4,
  encore: 0,
  ordering: 0,
};

export function roundMeta(
  index: number,
  type: RoundType,
  options: { category?: CategoryId; voided?: boolean } = {},
): RoundMeta {
  return {
    index,
    type,
    difficulty: type === "mystery" ? "medium" : null,
    category: options.category ?? (type === "encore" ? null : "geo"),
    answerType: type === "mystery" ? "country" : null,
    ordinal: 1,
    ofType: 1,
    maxPoints: MAX_POINTS[type],
    voided: options.voided ?? false,
  };
}

export function metas(...types: RoundType[]): RoundMeta[] {
  return types.map((type, index) => roundMeta(index, type));
}

export function config(
  rounds: RoundMeta[] | "stream",
  overrides: Partial<RunConfig> = {},
): RunConfig {
  return {
    mode: "practice",
    sealed: false,
    rounds,
    endRule: { kind: "fixed" },
    timing: { kind: "untimed" },
    scoring: "practice",
    seed: "test-seed",
    runId: "run-1",
    ...overrides,
  };
}

/** Deterministic v4 keys: 00000000-0000-4000-8000-<n>. */
export function key(n: number): IdempotencyKey {
  const parsed = parseIdempotencyKey(
    `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
  );
  if (parsed === null) throw new Error(`bad key ${n}`);
  return parsed;
}

export function judgeContext(
  at: EpochMs,
  optionsFromClue: 3 | 4 = 4,
): JudgeContext {
  return {
    at,
    rng: createRng(`judge:${at}`),
    shuffle: null,
    optionsFromClue,
    entities: null,
  };
}

/**
 * A controller in miniature: it applies events, keeps every command, and
 * for local runs answers `open_round` and `judge` with the echo plugins.
 */
export class Driver {
  state: RunState;
  commands: RunCommand[];
  readonly plugins: PluginRegistry;
  private content: EchoContent[];
  private judges = new Map<number, unknown>();
  private nextKey = 1;
  /** When false, judge commands wait for the test to answer them. */
  autoJudge: boolean;
  /** When false, open_round commands wait for the test (stream runs need meta). */
  autoOpen: boolean;
  optionsFromClue: 3 | 4 = 4;

  constructor(
    runConfig: RunConfig,
    at: EpochMs,
    options: {
      content?: EchoContent[];
      autoJudge?: boolean;
      autoOpen?: boolean;
    } = {},
  ) {
    this.plugins = createEchoRegistry();
    this.content = options.content ?? [];
    this.autoJudge = options.autoJudge ?? !runConfig.sealed;
    this.autoOpen = options.autoOpen ?? !runConfig.sealed;
    const start = createRun(runConfig, at);
    this.state = start.state;
    this.commands = [];
    this.handle(start.commands, at);
  }

  contentFor(index: number): EchoContent {
    return this.content[index] ?? {};
  }

  dispatch(event: RunEvent): RunCommand[] {
    const next = reduceRun(this.state, event, this.plugins);
    this.state = next.state;
    this.handle(next.commands, event.at);
    return next.commands;
  }

  private handle(commands: RunCommand[], at: EpochMs): void {
    this.commands.push(...commands);
    for (const command of commands) {
      if (command.kind === "open_round" && this.autoOpen) {
        this.openRound(command.index, at);
      }
      if (command.kind === "judge" && this.autoJudge) {
        this.judgeLocally(command.index, command.intent, command.key, at);
      }
    }
  }

  /** What a local controller does for open_round: the plugin's judge half opens it. */
  openRound(index: number, at: EpochMs, meta?: RoundMeta): void {
    const slotMeta = meta ?? this.state.slots[index]?.meta;
    if (slotMeta === undefined) throw new Error(`no meta for round ${index}`);
    const plugin = this.plugins[slotMeta.type];
    const { open, judge } = plugin.open(
      this.contentFor(index),
      slotMeta,
      judgeContext(at, this.optionsFromClue),
    );
    this.judges.set(index, judge);
    this.dispatch({
      type: "opened",
      at,
      index,
      open,
      ...(meta === undefined ? {} : { meta }),
    });
  }

  judgeLocally(
    index: number,
    intent: RoundIntent,
    k: IdempotencyKey,
    at: EpochMs,
  ): void {
    const meta = this.state.slots[index]?.meta;
    if (meta === undefined) throw new Error(`no round ${index}`);
    const plugin = this.plugins[meta.type];
    const result = plugin.judge(
      this.contentFor(index),
      this.judges.get(index),
      intent,
      judgeContext(at, this.optionsFromClue),
    );
    if (!result.ok) {
      this.dispatch({
        type: "failed",
        at,
        key: k,
        error: {
          code: result.error,
          retryable: false,
          retryAfterMs: null,
          refId: null,
        },
      });
      return;
    }
    this.judges.set(index, result.judge);
    this.dispatch({ type: "verdict", at, key: k, verdict: result.verdict });
  }

  /** Sends an intent with a fresh key and returns the key. */
  intent(intent: RoundIntent, at: EpochMs): IdempotencyKey {
    const k = key(this.nextKey);
    this.nextKey += 1;
    this.dispatch({ type: "intent", at, intent, key: k });
    return k;
  }

  answer(option: number, at: EpochMs): IdempotencyKey {
    return this.intent({ family: "choice", kind: "answer", option }, at);
  }

  continue(at: EpochMs): RunCommand[] {
    return this.dispatch({ type: "continue", at });
  }

  commandsOf<K extends RunCommand["kind"]>(
    kind: K,
  ): Extract<RunCommand, { kind: K }>[] {
    return this.commands.filter(
      (command): command is Extract<RunCommand, { kind: K }> =>
        command.kind === kind,
    );
  }
}
