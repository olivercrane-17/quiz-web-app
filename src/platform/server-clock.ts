/**
 * The server-corrected clock (ARCHITECTURE §4.3). Every RPC response
 * carries server_time; the backend feeds it here with the request's send
 * and receive times. The offset is the server time minus the midpoint of
 * the request, smoothed as the median of the last five samples, and kept in
 * session storage (`qz:server-clock`) so a reload starts corrected. Every
 * date-dependent display ("Next Daily in 5h 12m", unlock countdowns) reads
 * this clock.
 */
import type { Clock } from "@/engine/clock";
import type { EpochMs } from "@/engine/types";

import { systemClock } from "./clock";

/**
 * The uncorrected device clock, re-exported so `src/backend` (whose layer
 * rule allows `@/platform/server-clock` and nothing else from platform,
 * ARCHITECTURE §2.2) can default the mock's clock to it.
 */
export { systemClock };

export const SERVER_CLOCK_KEY = "qz:server-clock";
const MAX_SAMPLES = 5;
/** Offsets beyond a year, or round trips beyond a minute, are not clock samples. */
const MAX_OFFSET_MS = 366 * 24 * 3_600_000;
const MAX_RTT_MS = 60_000;

export interface ClockSample {
  offsetMs: number;
  rttMs: number;
}

/** The slice of sessionStorage the clock uses. */
export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ServerClock extends Clock {
  /** One response: its server_time and the local send and receive times. */
  observe(serverTime: EpochMs, sentAt: EpochMs, receivedAt: EpochMs): void;
  /** Server time minus local time, in ms. */
  offsetMs(): number;
  samples(): readonly ClockSample[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function isSample(value: unknown): value is ClockSample {
  if (typeof value !== "object" || value === null) return false;
  const { offsetMs, rttMs } = value as Record<string, unknown>;
  return (
    typeof offsetMs === "number" &&
    typeof rttMs === "number" &&
    Number.isFinite(offsetMs) &&
    Math.abs(offsetMs) <= MAX_OFFSET_MS &&
    rttMs >= 0 &&
    rttMs <= MAX_RTT_MS
  );
}

function load(store: SessionStore | null): ClockSample[] {
  if (store === null) return [];
  try {
    const parsed: unknown = JSON.parse(
      store.getItem(SERVER_CLOCK_KEY) ?? "null",
    );
    if (typeof parsed !== "object" || parsed === null) return [];
    const { v, samples } = parsed as { v?: unknown; samples?: unknown };
    if (v !== 1 || !Array.isArray(samples)) return [];
    return samples.filter(isSample).slice(-MAX_SAMPLES);
  } catch {
    return [];
  }
}

function save(store: SessionStore | null, samples: ClockSample[]): void {
  if (store === null) return;
  try {
    store.setItem(SERVER_CLOCK_KEY, JSON.stringify({ v: 1, samples }));
  } catch {
    // Session storage can be full or blocked; the clock still works in memory.
  }
}

export function createServerClock(
  options: { base?: Clock; storage?: SessionStore | null } = {},
): ServerClock {
  const base = options.base ?? systemClock;
  const storage = options.storage ?? null;
  let samples = load(storage);
  let offset = median(samples.map((s) => s.offsetMs));
  return {
    now: () => base.now() + offset,
    monotonic: () => base.monotonic(),
    observe(serverTime: EpochMs, sentAt: EpochMs, receivedAt: EpochMs): void {
      const sample = {
        offsetMs: serverTime - (sentAt + receivedAt) / 2,
        rttMs: receivedAt - sentAt,
      };
      if (!Number.isFinite(serverTime) || !isSample(sample)) return;
      samples = [...samples, sample].slice(-MAX_SAMPLES);
      offset = median(samples.map((s) => s.offsetMs));
      save(storage, samples);
    },
    offsetMs: () => offset,
    samples: () => samples,
  };
}

function sessionStorageOrNull(): SessionStore | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

let shared: ServerClock | null = null;

/** The tab's server clock, over the system clock and session storage. */
export function getServerClock(): ServerClock {
  shared ??= createServerClock({ storage: sessionStorageOrNull() });
  return shared;
}
