/**
 * The mock backend (ARCHITECTURE §7.4): a small in-page "server" that
 * follows the same rules as SQL, built from the same engine modules. It
 * composes one area per GameBackend area from `server/<area>.ts`
 * (`create<Area>Area(ctx)`), and wraps every call in the transport the
 * controls drive: latency, `navigator.onLine === false` as `offline`,
 * `setReachable(false)` as `unreachable`, injected failures (failNext) and
 * the response log that sealed-payload assertions read.
 *
 * In the browser the database is the persistent store (localStorage, Web
 * Locks, BroadcastChannel), shared by every tab and every device namespace
 * of one browser context, so a reload, a second tab or a second "phone"
 * meets the same server. A scenario from `__QZ_MOCK_INIT__` seeds an empty
 * database only, and every call waits for it, so it applies on the very
 * first render. A database that already holds anything (that scenario,
 * another one from `seed()`, or play) is left as it is, so a reload whose
 * init script sets the scenario again never undoes a later `seed()` or a
 * move. Each response's server time feeds the server clock, as the
 * Supabase adapter does (§7.1). A thrown error is a bug: it is logged and
 * answered as `internal`. The response log keeps the latest
 * RESPONSE_LOG_MAX responses.
 *
 * This chunk loads only in mock builds (getBackend), and bundles fixture
 * content only.
 */
import type { Clock } from "@/engine/clock";
import type { PluginRegistry } from "@/engine/rounds";
import type { EpochMs, Result } from "@/engine/types";
import { systemClock } from "@/platform/server-clock";

import { AREA_METHODS, composeBackend, type BackendMethod } from "../areas";
import type { BackendDeps } from "../deps";
import { backendError } from "../errors";
import type { BackendArea, GameBackend } from "../types";
import { createMockContext, type MockContext, type MockRules } from "./context";
import {
  RESPONSE_LOG_MAX,
  createTransportState,
  type MockControls,
  type MockInit,
  type MockTransportState,
} from "./controls";
import type { MockContent } from "./fixtures";
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
import {
  createMemoryStore,
  createPersistentStore,
  type MockStore,
} from "./store";

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
  /** Settles once the init scenario (if any) is seeded. */
  readonly ready: Promise<void>;
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

/** The server time a successful response carries, if it carries one. */
function serverTimeOf(result: Result<unknown>): EpochMs | null {
  if (!result.ok || typeof result.value !== "object" || result.value === null) {
    return null;
  }
  const time = (result.value as { serverTime?: unknown }).serverTime;
  return typeof time === "number" && Number.isFinite(time) ? time : null;
}

type AnyMethod = (...args: unknown[]) => unknown;

interface TransportOptions {
  transport: MockTransportState;
  clock: Clock;
  deps: BackendDeps;
  ready: Promise<void>;
}

/** Wraps an area's async methods in the simulated transport. */
function withTransport<A extends BackendArea>(
  area: A,
  impl: GameBackend[A],
  { transport, clock, deps, ready }: TransportOptions,
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
      const sentAt = clock.now();
      // Half the latency on the way out and half on the way back, so the
      // server's time sits mid-request, as the clock samples assume (§4.3).
      const half = Math.floor(transport.latencyMs / 2);
      await delay(half);
      await ready;
      let result: Result<unknown>;
      if (isOffline()) {
        result = { ok: false, error: backendError("offline") };
      } else if (!transport.reachable) {
        result = { ok: false, error: backendError("unreachable") };
      } else {
        const injected = takeFailure(transport, method, args);
        if (injected !== null) {
          result = { ok: false, error: injected };
        } else {
          try {
            result = (await fn.apply(impl, args)) as Result<unknown>;
          } catch (error) {
            console.error(
              `[mock] ${method} threw: ${(error as Error)?.message ?? String(error)}`,
            );
            result = { ok: false, error: backendError("internal") };
          }
        }
      }
      await delay(transport.latencyMs - half);
      const at: EpochMs = clock.now();
      const serverTime = serverTimeOf(result);
      if (serverTime !== null) {
        try {
          deps.serverClock.observe(serverTime, sentAt, at);
        } catch {
          // The clock keeps its earlier samples.
        }
      }
      const log = transport.responses;
      log.push({ method, at, payload: result });
      // Pollers (room heartbeats every 2 s) would grow it for the tab's life.
      if (log.length > RESPONSE_LOG_MAX) {
        log.splice(0, log.length - RESPONSE_LOG_MAX);
      }
      return result;
    };
  }
  return out as unknown as GameBackend[A];
}

function readInit(): MockInit {
  const init = (globalThis as { __QZ_MOCK_INIT__?: unknown }).__QZ_MOCK_INIT__;
  return typeof init === "object" && init !== null ? (init as MockInit) : {};
}

export interface MockBackendOptions {
  /** Default: the persistent store in a browser, else memory. */
  store?: MockStore;
  clock?: Clock;
  init?: MockInit;
  /** Attach window.__qzMock (browser builds). Default true where window exists. */
  attachControls?: boolean;
  /** Tests: other sealed content than the fixtures. */
  content?: MockContent;
  /** Tests: other round plugins, such as the echo registry. */
  plugins?: PluginRegistry;
  rules?: Partial<MockRules>;
}

export function createMockBackend(
  deps: BackendDeps,
  options: MockBackendOptions = {},
): MockBackend {
  const init = options.init ?? readInit();
  const store =
    options.store ??
    (typeof window === "undefined"
      ? createMemoryStore()
      : createPersistentStore());
  const clock = options.clock ?? systemClock;
  const transport = createTransportState();
  if (init.realtime !== undefined) transport.realtime = init.realtime;
  const context = createMockContext({
    store,
    clock,
    identity: deps.identity,
    transport,
    ...(init.seed === undefined ? {} : { seed: init.seed }),
    ...(options.content === undefined ? {} : { content: options.content }),
    ...(options.plugins === undefined ? {} : { plugins: options.plugins }),
    ...(options.rules === undefined ? {} : { rules: options.rules }),
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

  // The init scenario goes into an empty database only: anything there
  // already (it, a later seed(), or play) is what the spec meant to keep.
  const scenario = init.scenario;
  const ready =
    scenario === undefined ||
    scenario === "fresh" ||
    store.read((db) => Object.keys(db).length > 0)
      ? Promise.resolve()
      : controls.seed(scenario).catch((error: unknown) => {
          console.warn(`[mock] ${(error as Error).message}`);
        });

  const backend = composeBackend("mock", (area) =>
    withTransport(area, AREAS[area](context), {
      transport,
      clock,
      deps,
      ready,
    }),
  );
  const attach = options.attachControls ?? typeof window !== "undefined";
  if (attach) {
    (globalThis as { __qzMock?: MockControls }).__qzMock = controls;
  }
  return { ...backend, controls, context, ready };
}

export { createMemoryStore, createPersistentStore } from "./store";
export type { MockStore, MockDb } from "./store";
export type {
  FinisherSpec,
  MockControls,
  MockInit,
  MockMethod,
  MockScenario,
} from "./controls";
export type { MockContext, MockRules } from "./context";
export type { MockContent } from "./fixtures";
