/**
 * The Daily ranking (ARCHITECTURE §4.6, PRD §4.3.1 to §4.3.3): points, then
 * the Encore error, then total time. The same key decides challenges, the
 * Group Today tab and the percentile pool.
 *
 * - **Effective round time.** `max(serverMs - 400 × requests, clientMs)`,
 *   never below 0, capped at 15 minutes. `requests` counts the round's
 *   opening call (`begin_round`, or for round 0 the `start_*` call) and each
 *   accepted state-changing action. Refused calls (`invalid_entity`,
 *   `already_guessed`, `stale`, `rate_limited`), replays of a known key and
 *   repeated `begin_round` calls never count, so no client buys itself
 *   400 ms per call. The allowance and the cap come from
 *   `src/config/shared.json`, which the engine may not import; callers pass
 *   them, and these defaults equal it (a fixture test checks).
 * - **Rank key** (SQL parity): `points × 2^58 + (2^34 - 1 - errMicro) × 2^24
 *   + (2^24 - 1 - totalMs)`, higher is better and equal keys tie. `errMicro`
 *   is the error in millionths, rounded half up from the exact ratio the
 *   band check uses, capped at `2^34 - 1`, and 0 when the Encore is voided
 *   or absent, so it is equal for everyone. `totalMs` is capped at
 *   `2^24 - 1`. Points run from 0 to 31.
 * - **compareRuns** orders by the same three numbers, so it always agrees
 *   with the key, including the millionth resolution: two errors less than
 *   half a millionth apart tie on the Encore and fall to time.
 *
 * Pass the Encore's exact ratio where the guess and the answer are known
 * (the mock's finish does). An `EncoreError` carries only a float, which
 * can sit a hair under an exact half-millionth and round down where the
 * exact ratio rounds up; it is accepted for results that hold nothing else.
 */
import type { EncoreError } from "../types/rounds.ts";
import type { EncoreRatio } from "./encore.ts";

export interface TimingRules {
  /** `latency_allowance_ms`: the most a client may claim per request (PRD §4.3.3). */
  latencyAllowanceMs: number;
  /** `round_cap_ms`: one round's active interval counts at most this long (PRD §4.3.2). */
  roundCapMs: number;
}

export const DEFAULT_TIMING: Readonly<TimingRules> = Object.freeze({
  latencyAllowanceMs: 400,
  roundCapMs: 900_000,
});

/** One round's effective time (PRD §4.3.3). */
export function effectiveRoundMs(
  serverMs: number,
  clientMs: number,
  requests: number,
  rules: TimingRules = DEFAULT_TIMING,
): number {
  const allowed = Math.max(
    serverMs - rules.latencyAllowanceMs * Math.max(0, requests),
    clientMs,
    0,
  );
  return Math.min(allowed, rules.roundCapMs);
}

/** A call made in one round, as the server saw it. */
export type RoundCall =
  | "start"
  | "begin_round"
  | "accepted"
  | "replay"
  | "invalid_entity"
  | "already_guessed"
  | "stale"
  | "rate_limited";

/** The requests a round's latency allowance counts (§8.8, `timing.json`). */
export function countRequests(calls: readonly RoundCall[]): number {
  let opened = false;
  let count = 0;
  for (const call of calls) {
    if (call === "start" || call === "begin_round") {
      if (!opened) count += 1;
      opened = true;
    } else if (call === "accepted") {
      count += 1;
    }
  }
  return count;
}

/** One resolved round's timing inputs. */
export interface RoundTiming {
  serverMs: number;
  clientMs: number;
  requests: number;
  /** A voided round adds no time. */
  voided?: boolean;
}

/** Total time: the sum of the rounds' effective times (PRD §4.3.2). */
export function totalRunMs(
  rounds: readonly RoundTiming[],
  rules: TimingRules = DEFAULT_TIMING,
): number {
  return rounds.reduce(
    (sum, round) =>
      round.voided === true
        ? sum
        : sum +
          effectiveRoundMs(
            round.serverMs,
            round.clientMs,
            round.requests,
            rules,
          ),
    0,
  );
}

/** What the ranking reads from a finished run. */
export interface RankFacts {
  points: number;
  /** The exact ratio where known, else the float; null when voided or absent. */
  encore: EncoreRatio | EncoreError | null;
  totalMs: number;
}

const TWO = BigInt(2);
const MILLION = BigInt(1_000_000);
const POINTS_SHIFT = BigInt(2) ** BigInt(58);
const ERROR_SHIFT = BigInt(2) ** BigInt(24);

/** The largest error in millionths the key can hold: 2^34 - 1. */
export const MAX_ERROR_MICROS = 2 ** 34 - 1;
/** The largest total time the key can hold: 2^24 - 1 ms (about 4 h 40 min). */
export const MAX_RANK_MS = 2 ** 24 - 1;
/** The most points the key can hold. */
export const MAX_RANK_POINTS = 31;

function isRatio(encore: EncoreRatio | EncoreError): encore is EncoreRatio {
  return "num" in encore;
}

/** The Encore error in millionths, rounded half up and capped; 0 when voided or absent. */
export function encoreMicros(encore: EncoreRatio | EncoreError | null): number {
  if (encore === null) return 0;
  let micros: number;
  if (isRatio(encore)) {
    if (encore.den <= BigInt(0)) {
      throw new RangeError("encore ratio needs a positive denominator");
    }
    const num = encore.num < BigInt(0) ? -encore.num : encore.num;
    // floor(num × 10^6 / den + 1/2), in integers.
    const rounded = (num * MILLION * TWO + encore.den) / (TWO * encore.den);
    micros =
      rounded > BigInt(MAX_ERROR_MICROS) ? MAX_ERROR_MICROS : Number(rounded);
  } else {
    micros = Math.floor(Math.abs(encore.value) * 1_000_000 + 0.5);
  }
  return Math.min(Math.max(micros, 0), MAX_ERROR_MICROS);
}

function rankMs(totalMs: number): number {
  return Math.min(Math.max(Math.round(totalMs), 0), MAX_RANK_MS);
}

/** The SQL rank key: higher is better, equal keys tie. */
export function rankKey(run: RankFacts): bigint {
  if (
    !Number.isInteger(run.points) ||
    run.points < 0 ||
    run.points > MAX_RANK_POINTS
  ) {
    throw new RangeError(
      `rank keys hold 0 to ${MAX_RANK_POINTS} points, got ${run.points}`,
    );
  }
  return (
    BigInt(run.points) * POINTS_SHIFT +
    BigInt(MAX_ERROR_MICROS - encoreMicros(run.encore)) * ERROR_SHIFT +
    BigInt(MAX_RANK_MS - rankMs(run.totalMs))
  );
}

/** Which key separated two runs. */
export type RankDecider = "points" | "encore" | "time" | "tie";

/** The first key on which `a` and `b` differ, and the sign: negative when `a` ranks ahead. */
export function rankDifference(
  a: RankFacts,
  b: RankFacts,
): { decidedBy: RankDecider; order: number } {
  if (a.points !== b.points) {
    return { decidedBy: "points", order: b.points > a.points ? 1 : -1 };
  }
  const errorA = encoreMicros(a.encore);
  const errorB = encoreMicros(b.encore);
  if (errorA !== errorB) {
    return { decidedBy: "encore", order: errorA > errorB ? 1 : -1 };
  }
  const timeA = rankMs(a.totalMs);
  const timeB = rankMs(b.totalMs);
  if (timeA !== timeB) {
    return { decidedBy: "time", order: timeA > timeB ? 1 : -1 };
  }
  return { decidedBy: "tie", order: 0 };
}

/** A comparator, best first: negative when `a` ranks ahead of `b`, 0 on a tie. */
export function compareRuns(a: RankFacts, b: RankFacts): number {
  return rankDifference(a, b).order;
}

export interface RankedEntry<T> {
  item: T;
  /** 1-based; tied entries share a rank and the next rank skips ("=2nd", then 4th). */
  rank: number;
  tied: boolean;
}

/**
 * Competition ranking by any best-first comparator: entries that compare
 * equal share a rank. Ties keep their input order.
 */
export function rankBy<T>(
  items: readonly T[],
  compare: (a: T, b: T) => number,
): RankedEntry<T>[] {
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index);
  const out: RankedEntry<T>[] = [];
  sorted.forEach(({ item }, position) => {
    const previous = out[position - 1];
    const rank =
      previous !== undefined && compare(previous.item, item) === 0
        ? previous.rank
        : position + 1;
    out.push({ item, rank, tied: false });
  });
  for (let i = 0; i < out.length; i += 1) {
    const entry = out[i];
    if (entry === undefined) continue;
    entry.tied =
      out[i - 1]?.rank === entry.rank || out[i + 1]?.rank === entry.rank;
  }
  return out;
}

/** Runs ranked by the Daily rule (the Group Today tab, PRD §3.7.2). */
export function rankRuns<T extends RankFacts>(
  runs: readonly T[],
): RankedEntry<T>[] {
  return rankBy(runs, compareRuns);
}
