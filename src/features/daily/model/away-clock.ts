/**
 * The Daily's running time as Today's Continue card shows it (RITE round
 * 4, R4-04): the card said "Your stopwatch is still running." and showed no
 * time. Worked out from the attempt's snapshot the way the play header
 * works it out after a reload (`elapsedMs` and the controller's
 * `timeOffsetOf`), so the card and the header read the same second: every
 * resolved round counts its recorded time to the whole second, and the open
 * round counts the server's interval so far, the response's trip back, and
 * the device's own time since, up to the round's 15-minute cap.
 *
 * A module of its own with no screen code in it: the card's lazy chunk
 * takes it without the controller. `away-clock.test.ts` holds it equal to
 * the header's figures.
 */
import { SHARED } from "@/config/shared";
import type { AttemptSnapshot, EpochMs } from "@/engine/types";

/** The most a response's trip back can add: the server clock's own bound on a round trip. */
const MAX_TRIP_MS = 60_000;

export interface AwayClock {
  /** The resolved rounds' recorded time, each to the whole second. */
  resolvedMs: number;
  /** The open round's interval at `at`. */
  openMs: number;
  /** The device's time when the snapshot arrived. */
  at: EpochMs;
}

function wholeSecond(ms: number): number {
  return Math.floor(Math.max(0, ms) / 1000) * 1000;
}

/**
 * The clock of an attempt whose round is open, or null: on a reveal, between
 * rounds and once finished nothing is counting, and the card says nothing
 * of time. `serverNow` is the server-corrected clock as the response
 * arrives, `at` the device's own.
 */
export function awayClockOf(
  snapshot: AttemptSnapshot,
  at: EpochMs,
  serverNow: EpochMs | null = null,
): AwayClock | null {
  const current = snapshot.current;
  if (
    snapshot.status !== "active" ||
    current === null ||
    current.open === null
  ) {
    return null;
  }
  const trip =
    serverNow === null || !Number.isFinite(serverNow)
      ? 0
      : Math.min(Math.max(0, serverNow - snapshot.serverTime), MAX_TRIP_MS);
  const openMs =
    (current.activeMs ??
      Math.max(0, snapshot.serverTime - current.open.issuedAt)) + trip;
  let resolvedMs = 0;
  for (const round of snapshot.resolved) {
    resolvedMs += wholeSecond(Math.min(round.activeMs ?? 0, SHARED.roundCapMs));
  }
  return { resolvedMs, openMs, at };
}

/** Total active time at the device's `now`, as the header would show it. */
export function awayClockMs(clock: AwayClock, now: EpochMs): number {
  return (
    clock.resolvedMs +
    Math.min(clock.openMs + Math.max(0, now - clock.at), SHARED.roundCapMs)
  );
}
