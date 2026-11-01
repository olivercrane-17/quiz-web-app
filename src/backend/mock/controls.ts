/**
 * Mock controls (ARCHITECTURE §7.4, §11.4): `window.__qzMock`, attached only
 * in mock builds and typed for specs in e2e/support/mock.ts (PLT-1). Pages
 * read `window.__QZ_MOCK_INIT__` before the app loads, so a scenario applies
 * on the very first render.
 *
 * Wave 0 implements the transport controls (latency, reachability,
 * realtime, shed, injected failures), inspect() and the response log, and
 * the `fresh` scenario. DLY-1 completes seed(); the crowd, service-state and
 * incident controls arrive with the tickets that build those areas.
 */
import type {
  BackendErrorCode,
  DailyNumber,
  EpochMs,
  ServiceStatus,
} from "@/engine/types";

import type { BackendMethod } from "../areas";
import type { MockStore } from "./store";

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
  /** For sealed-payload assertions. */
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

export function createMockControls(
  store: MockStore,
  transport: MockTransportState,
): MockControls {
  const controls: MockControls = {
    async reset() {
      await store.replace({});
      transport.latencyMs = DEFAULT_LATENCY_MS;
      transport.reachable = true;
      transport.realtime = "live";
      transport.shed = false;
      transport.failures = [];
      transport.responses = [];
    },
    async seed(scenario) {
      if (scenario === "fresh") return controls.reset();
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
