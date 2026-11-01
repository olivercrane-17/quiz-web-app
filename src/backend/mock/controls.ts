/**
 * Mock controls (ARCHITECTURE §7.4, §11.4): `window.__qzMock`, attached only
 * in mock builds and typed for specs in e2e/support/mock.ts (PLT-1). Pages
 * read `window.__QZ_MOCK_INIT__` before the app loads, so a scenario applies
 * on the very first render; it seeds an empty database only, so `seed()`
 * after it, or play, survives a reload that sets it again.
 *
 * The transport controls (latency, reachability, realtime, shed, injected
 * failures), `inspect()` and the response log steer every call. `seed()`
 * builds a scenario by playing it through the sealed area with the round
 * plugins, so a seeded attempt is exactly what play would have left:
 *
 * - `fresh`: an empty server.
 * - `finished_today`: today's Daily finished by the device's identity:
 *   the Mysteries solved on clues 1, 2 and 3 in turn (one wrong guess before
 *   the second, Next clue before the third), choice rounds right, and the
 *   Encore 4% off (or 3 years off). On a three-Mystery Daily that is
 *   "9/12 · Encore 4% off" (PRD §3.5.1's example).
 * - `in_progress_mystery_2`: Mystery 1 solved on clue 2 after a wrong
 *   guess, and Mystery 2 open on clue 2 with one wrong guess (AC-DLY-07).
 *
 * The streak, Group, challenge, room and editor scenarios, `addFinishers`,
 * `setServiceState` and `addIncident` arrive with the tickets that build
 * those areas (STK-1, GRP-1, CHL-1, ROM-1, EDT-1, DLY-3, INC-1).
 */
import type {
  BackendErrorCode,
  DailyNumber,
  EncoreContent,
  EpochMs,
  IdempotencyKey,
  MysteryContent,
  RoundIntent,
  RoundOpen,
  SealedChoiceContent,
  ServiceStatus,
} from "@/engine/types";

import type { BackendMethod } from "../areas";
import type { BrowserContextInfo } from "../types";
import type { MockContext } from "./context";
import { authenticate, confirmRegistered } from "./server/identity";
import {
  actIn,
  beginRoundIn,
  loadRound,
  nextUuid,
  startDaily,
  stepOf,
  type MockAttemptRow,
} from "./server/sealed";
import type { MockDb } from "./store";

export type MockMethod = BackendMethod;

export type MockScenario =
  | "fresh"
  | "returning_streak_9_one_freeze"
  | "streak_23_missed_yesterday"
  | "two_freezes_three_missed"
  | "repair_used_5_days_ago"
  | "finished_today"
  | "in_progress_mystery_2"
  | "in_app_first_finish"
  | "group_of_4"
  | "challenge_received"
  | "room_lobby_5_seats"
  | "editor_with_quiz";

/** How synthetic finishers for a crowd look (refined by the ticket that builds crowds). */
export interface FinisherSpec {
  /** Points for every finisher, or one value per finisher in turn. */
  points?: number | number[];
  /** UTC offset at attempt start, which picks the percentile band. */
  offsetMinutes?: number;
  flagged?: boolean;
  lowTrust?: boolean;
}

export interface MockFailureOptions {
  /** How many calls fail; default 1. */
  times?: number;
  /** Only calls whose first argument has these fields, e.g. { questionIndex: 6 }. */
  when?: Record<string, unknown>;
}

export interface MockControls {
  reset(): Promise<void>;
  seed(scenario: MockScenario): Promise<void>;
  failNext(
    method: MockMethod,
    code: BackendErrorCode,
    opts?: MockFailureOptions,
  ): void;
  /** Default 30 ms, so async paths really run. */
  setLatency(ms: number): void;
  /** false: every call fails 'unreachable'. */
  setReachable(reachable: boolean): void;
  /** 'down': hints stop; subscribers get status 'down'. */
  setRealtime(state: "live" | "down"): void;
  /** The storage shed switch of §8.1. */
  setShed(on: boolean): void;
  addFinishers(
    dailyNumber: DailyNumber,
    count: number,
    spec?: FinisherSpec,
  ): Promise<void>;
  setServiceState(status: Partial<ServiceStatus>): Promise<void>;
  addIncident(start: EpochMs, end: EpochMs): Promise<void>;
  /** Read-only, e.g. 'attempts' or 'rooms.<id>'. */
  inspect<T = unknown>(path: string): T;
  /**
   * For sealed-payload assertions: every call's result, oldest first, up to
   * the latest RESPONSE_LOG_MAX (older ones drop off the front).
   */
  responses(): { method: MockMethod; at: EpochMs; payload: unknown }[];
}

/** `window.__QZ_MOCK_INIT__`, set by E2E with page.addInitScript. */
export interface MockInit {
  scenario?: MockScenario;
  /** Seeds the mock's RNG, so ids and codes repeat run to run; default 'qz'. */
  seed?: string;
  failures?: {
    method: MockMethod;
    code: BackendErrorCode;
    times?: number;
    when?: Record<string, unknown>;
  }[];
  latencyMs?: number;
  realtime?: "live" | "down";
}

export const DEFAULT_LATENCY_MS = 30;
/** How many responses the log keeps, so a polling tab's log stays bounded. */
export const RESPONSE_LOG_MAX = 1000;

/** The transport state every wrapped call consults. */
export interface MockTransportState {
  latencyMs: number;
  reachable: boolean;
  realtime: "live" | "down";
  shed: boolean;
  failures: {
    method: MockMethod;
    code: BackendErrorCode;
    remaining: number;
    when: Record<string, unknown> | null;
  }[];
  responses: { method: MockMethod; at: EpochMs; payload: unknown }[];
}

export function createTransportState(): MockTransportState {
  return {
    latencyMs: DEFAULT_LATENCY_MS,
    reachable: true,
    realtime: "live",
    shed: false,
    failures: [],
    responses: [],
  };
}

function notYet(control: string): Promise<never> {
  return Promise.reject(
    new Error(`mock control ${control} is not built yet (ARCHITECTURE §12)`),
  );
}

function pick(document: unknown, path: string): unknown {
  let at: unknown = document;
  for (const part of path.split(".").filter(Boolean)) {
    if (typeof at !== "object" || at === null) return undefined;
    at = (at as Record<string, unknown>)[part];
  }
  return at;
}

/** Where seed() records the scenario it built: `inspect('scenario')`. */
export const SCENARIO_MARKER = "scenario";

/** The scenarios seed() builds, beyond `fresh`. */
export const BUILT_SCENARIOS = [
  "finished_today",
  "in_progress_mystery_2",
] as const satisfies readonly MockScenario[];
type BuiltScenario = (typeof BUILT_SCENARIOS)[number];

function isBuilt(scenario: MockScenario): scenario is BuiltScenario {
  return (BUILT_SCENARIOS as readonly string[]).includes(scenario);
}

/** What a scenario does with one round. */
type RoundPlan =
  /** Solve a Mystery on `clue`, spending the clues before it on wrong guesses or Next clue. */
  | { kind: "solve"; clue: 1 | 2 | 3 | 4; before: "guess" | "next_clue" }
  /** Make wrong guesses and leave the Mystery open. */
  | { kind: "leave_open"; wrongGuesses: number }
  /** Lock in the Encore near its answer. */
  | { kind: "encore" }
  | { kind: "choice"; correct: boolean };

/** The device a scenario's attempt claims to come from. */
const SCENARIO_BROWSER: BrowserContextInfo = {
  context: "browser",
  app: "none",
  platform: "other",
};

function deviceZone(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function scenarioError(message: string): Error {
  return new Error(`mock scenario: ${message}`);
}

/** The index of the option whose label is one of `labels`, or the first that isn't. */
function optionIndex(
  open: Extract<RoundOpen, { family: "mystery" | "choice" }>,
  labels: readonly string[],
  matching: boolean,
): number {
  const options = open.options ?? [];
  const found = options.find(
    (option) =>
      labels.includes(option.label) === matching && !option.alreadyGuessed,
  );
  if (found === undefined) {
    throw scenarioError(`no ${matching ? "matching" : "other"} option to pick`);
  }
  return found.index;
}

/** A guess near the answer: 4% off for quantities (a bullseye), 3 years off for years. */
function encoreGuess(content: EncoreContent): number {
  if (content.valueKind === "year") return content.answer + 3;
  const scale = 10 ** content.decimals;
  return Math.max(1 / scale, Math.round(content.answer * 1.04 * scale) / scale);
}

async function playRound(
  ctx: MockContext,
  db: MockDb,
  attempt: MockAttemptRow,
  index: number,
  plan: RoundPlan,
): Promise<void> {
  const now = ctx.clock.now();
  const { start } = await beginRoundIn(ctx, db, attempt, index, now);
  if (start.kind === "withdrawn") return;
  const row = attempt.rounds[index] as MockAttemptRow["rounds"][number];
  const { content, entities } = await loadRound(ctx, row);
  const act = async (intent: RoundIntent): Promise<void> => {
    const open = row.open;
    if (open === null) throw scenarioError(`round ${index + 1} is not open`);
    const result = await actIn(ctx, db, attempt, {
      index,
      step: stepOf(open),
      intent,
      clientActiveMs: 0,
      hiddenMs: 0,
      key: nextUuid(ctx, db, "scenario-key") as IdempotencyKey,
    });
    if (!result.ok) {
      throw scenarioError(`${result.error.code} on round ${index + 1}`);
    }
  };

  if (plan.kind === "encore") {
    await act({
      family: "encore",
      kind: "lock_in",
      value: encoreGuess(content as EncoreContent),
    });
    return;
  }
  if (plan.kind === "choice") {
    const choice = content as SealedChoiceContent;
    const open = row.open;
    if (open?.family !== "choice") throw scenarioError("not a choice round");
    const key = choice.options[choice.correct] ?? "";
    await act({
      family: "choice",
      kind: "answer",
      option: optionIndex(open, [key], plan.correct),
    });
    return;
  }

  const mystery = content as MysteryContent;
  const answer = entities?.get(mystery.answer) ?? null;
  const answerLabels =
    answer === null ? [] : [answer.display, answer.optionLabel];
  const wrong = [...mystery.distractors];
  const clueOf = () => (row.open?.family === "mystery" ? row.open.clue : 4);
  const optionsShown = () =>
    row.open?.family === "mystery" && row.open.options !== null;

  if (plan.kind === "leave_open") {
    for (let made = 0; made < plan.wrongGuesses; made += 1) {
      const guess = wrong.shift();
      if (guess === undefined || optionsShown()) {
        throw scenarioError("no wrong guess left to make");
      }
      await act({ family: "mystery", kind: "guess", entityId: guess });
    }
    return;
  }

  while (row.reveal === null && clueOf() < plan.clue) {
    const guess =
      plan.before === "guess" && !optionsShown() ? wrong.shift() : undefined;
    await act(
      guess === undefined
        ? { family: "mystery", kind: "next_clue" }
        : { family: "mystery", kind: "guess", entityId: guess },
    );
  }
  if (row.reveal !== null) return;
  const open = row.open;
  if (open?.family !== "mystery") throw scenarioError("not a Mystery round");
  await act(
    open.options === null
      ? { family: "mystery", kind: "guess", entityId: mystery.answer }
      : {
          family: "mystery",
          kind: "pick",
          option: optionIndex(open, answerLabels, true),
        },
  );
}

/** The plan for each round of a scenario; `null` stops the play there. */
function plansFor(
  scenario: BuiltScenario,
  attempt: MockAttemptRow,
): (RoundPlan | null)[] {
  const solves: RoundPlan[] = [
    { kind: "solve", clue: 1, before: "next_clue" },
    { kind: "solve", clue: 2, before: "guess" },
    { kind: "solve", clue: 3, before: "next_clue" },
  ];
  let mysteries = 0;
  let stopped = false;
  return attempt.rounds.map((row): RoundPlan | null => {
    if (stopped) return null;
    switch (row.meta.type) {
      case "encore":
        return { kind: "encore" };
      case "mystery": {
        mysteries += 1;
        if (scenario === "finished_today") {
          return solves[(mysteries - 1) % solves.length] as RoundPlan;
        }
        if (mysteries === 1) return { kind: "solve", clue: 2, before: "guess" };
        stopped = true;
        return { kind: "leave_open", wrongGuesses: 1 };
      }
      case "ordering":
        throw scenarioError("ordering rounds are not supported in v1");
      default:
        return { kind: "choice", correct: true };
    }
  });
}

async function buildScenario(
  ctx: MockContext,
  scenario: BuiltScenario,
): Promise<void> {
  await ctx.store.replace({});
  await ctx.store.write(
    async (db) => {
      const auth = authenticate(ctx, db, {
        register: true,
        browser: SCENARIO_BROWSER,
      });
      if (!auth.ok) throw scenarioError("the device has no usable identity");
      const started = await startDaily(ctx, db, {
        player: auth.player,
        tz: deviceZone(),
        browser: SCENARIO_BROWSER,
        appVersion: "mock-scenario",
      });
      if (!started.ok) throw scenarioError(started.error.code);
      const attempt = started.value;
      const plans = plansFor(scenario, attempt);
      if (
        scenario === "in_progress_mystery_2" &&
        !plans.some((plan) => plan?.kind === "leave_open")
      ) {
        throw scenarioError(
          "in_progress_mystery_2 needs a Daily with two Mysteries",
        );
      }
      for (const [index, plan] of plans.entries()) {
        if (plan === null) break;
        await playRound(ctx, db, attempt, index, plan);
      }
      db[SCENARIO_MARKER] = { name: scenario };
    },
    ["players", "credentials", "attempts", "roundActions", SCENARIO_MARKER],
  );
  confirmRegistered(ctx);
}

export function createMockControls(ctx: MockContext): MockControls {
  const { store, transport } = ctx;
  const controls: MockControls = {
    async reset() {
      await store.replace({});
      transport.latencyMs = DEFAULT_LATENCY_MS;
      transport.reachable = true;
      transport.realtime = "live";
      ctx.realtime.setState("live");
      transport.shed = false;
      transport.failures = [];
      transport.responses = [];
    },
    async seed(scenario) {
      if (scenario === "fresh") return controls.reset();
      if (isBuilt(scenario)) return buildScenario(ctx, scenario);
      return notYet(`seed('${scenario}')`);
    },
    failNext(method, code, opts = {}) {
      transport.failures.push({
        method,
        code,
        remaining: Math.max(1, opts.times ?? 1),
        when: opts.when ?? null,
      });
    },
    setLatency(ms) {
      transport.latencyMs = Math.max(0, ms);
    },
    setReachable(reachable) {
      transport.reachable = reachable;
    },
    setRealtime(state) {
      transport.realtime = state;
      ctx.realtime.setState(state);
    },
    setShed(on) {
      transport.shed = on;
    },
    addFinishers: () => notYet("addFinishers"),
    setServiceState: () => notYet("setServiceState"),
    addIncident: () => notYet("addIncident"),
    inspect<T = unknown>(path: string): T {
      return pick(store.snapshot(), path) as T;
    },
    responses: () => transport.responses.slice(),
  };
  return controls;
}
