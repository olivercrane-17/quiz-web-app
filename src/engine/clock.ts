/**
 * Time as an injected dependency (ARCHITECTURE §4.3). Engine code never reads
 * the system clock: time arrives as `at` on events or through a Clock.
 * src/platform/clock.ts provides the system clock, src/platform/server-clock.ts
 * the server-corrected one.
 */
import type { EpochMs } from "./types/ids.ts";

export interface Clock {
  /** Wall time in ms since the Unix epoch. */
  now(): EpochMs;
  /** A monotonic reading in ms, for measuring intervals. */
  monotonic(): number;
}

export interface FakeClock extends Clock {
  /** Moves wall and monotonic time forward together. */
  advance(ms: number): void;
  /** Sets wall time only, as a device clock change would. */
  set(at: EpochMs): void;
}

export function createFakeClock(start: EpochMs): FakeClock {
  let wall = start;
  let elapsed = 0;
  return {
    now: () => wall,
    monotonic: () => elapsed,
    advance(ms: number): void {
      if (!Number.isFinite(ms) || ms < 0) {
        throw new RangeError(`a fake clock only moves forward, got ${ms}`);
      }
      wall += ms;
      elapsed += ms;
    },
    set(at: EpochMs): void {
      if (!Number.isFinite(at)) throw new RangeError(`not a time: ${at}`);
      wall = at;
    },
  };
}
