/**
 * The mock backend (ARCHITECTURE §7.4): a small in-page "server" that
 * follows the same rules as SQL, built from the same engine modules. It
 * composes one area per GameBackend area from `server/<area>.ts`
 * (`create<Area>Area(ctx)`), and wraps every call in the transport the
 * controls drive: latency, `navigator.onLine === false` as `offline`,
 * `setReachable(false)` as `unreachable`, injected failures (failNext) and
 * the response log that sealed-payload assertions read.
 *
 * This chunk loads only in mock builds (getBackend), and bundles fixture
 * content only.
 */
import type { Clock } from "@/engine/clock";
import type { EpochMs, Result } from "@/engine/types";
import { systemClock } from "@/platform/server-clock";

import { AREA_METHODS, composeBackend, type BackendMethod } from "../areas";
import type { BackendDeps } from "../deps";
import { backendError } from "../errors";
import type { BackendArea, GameBackend } from "../types";
import { createMockContext, type MockContext } from "./context";
import {
  createTransportState,
  type MockControls,
  type MockInit,
  type MockTransportState,
} from "./controls";
import { createAnalyticsArea } from "./server/analytics";
import { createChallengesArea } from "./server/challenges";
import { createDailyArea } from "./server/daily";
import { createGroupsArea } from "./server/groups";
import { createHealthArea } from "./server/health";
import { createIdentityArea } from "./server/identity";
import { createPracticeArea } from "./server/practice";
import { createQuizzesArea } from "./server/quizzes";
import { createReportsArea } from "./server/reports";
import { createRoomsArea } from "./server/rooms";
import { createSealedArea } from "./server/sealed";
import { createStatsArea } from "./server/stats";
import { createStreaksArea } from "./server/streaks";
import { createMemoryStore, type MockStore } from "./store";

const AREAS: { [A in BackendArea]: (ctx: MockContext) => GameBackend[A] } = {
  identity: createIdentityArea,
  sealed: createSealedArea,
  daily: createDailyArea,
  streaks: createStreaksArea,
  stats: createStatsArea,
  challenges: createChallengesArea,
  groups: createGroupsArea,
  rooms: createRoomsArea,
  quizzes: createQuizzesArea,
  reports: createReportsArea,
  practice: createPracticeArea,
  analytics: createAnalyticsArea,
  health: createHealthArea,
};

export interface MockBackend extends GameBackend {
  readonly controls: MockControls;
  readonly context: MockContext;
}

function isOffline(): boolean {
  try {
    return globalThis.navigator?.onLine === false;
  } catch {
    return false;
  }
}

function matches(
  when: Record<string, unknown> | null,
  args: unknown[],
): boolean {
  if (when === null) return true;
  const first = args[0];
  if (typeof first !== "object" || first === null) return false;
  const record = first as Record<string, unknown>;
  return Object.entries(when).every(([key, value]) => record[key] === value);
}

function takeFailure(
  transport: MockTransportState,
  method: BackendMethod,
  args: unknown[],
): ReturnType<typeof backendError> | null {
  const index = transport.failures.findIndex(
    (failure) => failure.method === method && matches(failure.when, args),
  );
  const failure = transport.failures[index];
  if (failure === undefined) return null;
  failure.remaining -= 1;
  if (failure.remaining <= 0) transport.failures.splice(index, 1);
  return backendError(
    failure.code,
    failure.code === "rate_limited"
      ? { retryAfterMs: 1000, limitScope: "player" }
      : {},
  );
}

function delay(ms: number): Promise<void> {
  return ms <= 0
    ? Promise.resolve()
    : new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
}

type AnyMethod = (...args: unknown[]) => unknown;

/** Wraps an area's async methods in the simulated transport. */
function withTransport<A extends BackendArea>(
  area: A,
  impl: GameBackend[A],
  transport: MockTransportState,
  clock: Clock,
): GameBackend[A] {
  const source = impl as unknown as Record<string, AnyMethod>;
  const out: Record<string, AnyMethod> = {};
  for (const name of AREA_METHODS[area]) {
    const fn = source[name];
    if (fn === undefined) continue;
    if (area === "rooms" && name === "subscribe") {
      out[name] = fn.bind(impl);
      continue;
    }
    const method = `${area}.${name}` as BackendMethod;
    out[name] = async (...args: unknown[]): Promise<unknown> => {
      await delay(transport.latencyMs);
      let result: Result<unknown>;
      if (isOffline()) {
        result = { ok: false, error: backendError("offline") };
      } else if (!transport.reachable) {
        result = { ok: false, error: backendError("unreachable") };
      } else {
        const injected = takeFailure(transport, method, args);
        result = injected
          ? { ok: false, error: injected }
          : ((await fn.apply(impl, args)) as Result<unknown>);
      }
      const at: EpochMs = clock.now();
      transport.responses.push({ method, at, payload: result });
      return result;
    };
  }
  return out as unknown as GameBackend[A];
}

function readInit(): MockInit {
  const init = (globalThis as { __QZ_MOCK_INIT__?: unknown }).__QZ_MOCK_INIT__;
  return typeof init === "object" && init !== null ? (init as MockInit) : {};
}

export function createMockBackend(
  deps: BackendDeps,
  options: {
    store?: MockStore;
    clock?: Clock;
    init?: MockInit;
    /** Attach window.__qzMock (browser builds). Default true where window exists. */
    attachControls?: boolean;
  } = {},
): MockBackend {
  const init = options.init ?? readInit();
  const store = options.store ?? createMemoryStore();
  const clock = options.clock ?? systemClock;
  const transport = createTransportState();
  const context = createMockContext({
    store,
    clock,
    identity: deps.identity,
    transport,
    ...(init.seed === undefined ? {} : { seed: init.seed }),
  });
  const controls = context.controls;
  if (init.latencyMs !== undefined) controls.setLatency(init.latencyMs);
  if (init.realtime !== undefined) controls.setRealtime(init.realtime);
  for (const failure of init.failures ?? []) {
    controls.failNext(failure.method, failure.code, {
      ...(failure.times === undefined ? {} : { times: failure.times }),
      ...(failure.when === undefined ? {} : { when: failure.when }),
    });
  }
  if (init.scenario !== undefined && init.scenario !== "fresh") {
    void controls.seed(init.scenario).catch((error: unknown) => {
      console.warn(`[mock] ${(error as Error).message}`);
    });
  }

  const backend = composeBackend("mock", (area) =>
    withTransport(area, AREAS[area](context), transport, clock),
  );
  const attach = options.attachControls ?? typeof window !== "undefined";
  if (attach) {
    (globalThis as { __qzMock?: MockControls }).__qzMock = controls;
  }
  return { ...backend, controls, context };
}

export { createMemoryStore } from "./store";
export type { MockStore, MockDb } from "./store";
export type {
  FinisherSpec,
  MockControls,
  MockInit,
  MockMethod,
  MockScenario,
} from "./controls";
export type { MockContext } from "./context";
