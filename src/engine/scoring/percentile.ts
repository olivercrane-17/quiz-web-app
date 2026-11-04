/**
 * The percentile and the crowd's numbers (ARCHITECTURE §4.6, §8.9; PRD
 * §4.1.5, §4.3.4 to §4.3.6).
 *
 * - **Pool.** Eligible runs for the date in the player's offset band once
 *   that band holds `percentile_min_n` of them (the player's own run counts
 *   toward that only when it is eligible), otherwise every eligible run for
 *   the date. Bands by the offset at attempt start: 0 Americas (below
 *   -02:00), 1 Europe and Africa (-02:00 up to +04:00), 2 Asia and Pacific
 *   (+04:00 and above).
 * - **Formula.** With `N` the pool counting the player once, `B` the runs
 *   strictly worse and `T` those tied (the player excluded):
 *   `P = floor(100 × (B + 0.5 × T) / (N - 1))`, computed in integers. Shown
 *   only when `N >= percentile_min_n`; below it the cold-start state names
 *   `N` finishers. An unranked play (archive, challenge-only) isn't one of
 *   the date's eligible finishers, so "You'd have beaten N%" waits until
 *   the pool holds `percentile_min_n` of them without the player (PRD
 *   §3.2.1, ARCHITECTURE §8.9), while `N` in the formula still counts the
 *   player once.
 * - **Copy.** "Nobody has beaten you so far today." whenever nothing in the
 *   pool ranks strictly better (`B + T = N - 1`), which covers a tied top
 *   whose `P` is under 100; "This one was tough." when `P` is under 5 and
 *   someone did rank better; otherwise "You beat P%".
 * - **Flagged and low-trust players** (and archive plays) still get a
 *   number: their run is placed in the eligible pool without being added
 *   to anyone else's.
 * - **Crowd shares** use largest-remainder rounding, so whole percentages
 *   sum to 100. Equal remainders go to the earlier bucket (clue 1 before
 *   clue 2, and so on), the same order SQL uses.
 * - **Honest-play flags** decide eligibility (PRD §4.3.6, §8.8): 1 hidden
 *   play (`honest_play_hidden_ms` or more in any one round), 2 the expert
 *   slot, 4 too fast (a typed solve within `too_fast_ms` of its clue; picks
 *   never count), 8 a missing visibility report, 16 a zone change since the
 *   player's previous Daily (decisions memo §14.1), 32 low trust. A run is
 *   eligible when no flag is set. Flags change nothing on screen.
 */
import type { PercentileView } from "../types/daily.ts";

/** 0 Americas, 1 Europe and Africa, 2 Asia and Pacific. */
export type OffsetBand = 0 | 1 | 2;

/** The band of a UTC offset in minutes (PRD §4.3.4). */
export function offsetBand(minutes: number): OffsetBand {
  if (minutes < -120) return 0;
  if (minutes < 240) return 1;
  return 2;
}

/** `floor(100 × (worse + 0.5 × tied) / (pool - 1))`, where `pool` counts the player once. */
export function percentile(worse: number, tied: number, pool: number): number {
  for (const [name, value] of [
    ["worse", worse],
    ["tied", tied],
    ["pool", pool],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`percentile: ${name} must be a whole number >= 0`);
    }
  }
  if (pool < 2 || worse + tied > pool - 1) {
    throw new RangeError(
      `percentile: a pool of ${pool} can't hold ${worse} worse and ${tied} tied runs besides the player`,
    );
  }
  return Math.floor((200 * worse + 100 * tied) / (2 * (pool - 1)));
}

/** Which line the stop screen leads with (PRD §4.3.4). */
export type PercentileHeadline = "nobody_better" | "tough" | "beat";

export function percentileHeadline(
  worse: number,
  tied: number,
  pool: number,
): PercentileHeadline {
  if (worse + tied === pool - 1) return "nobody_better";
  return percentile(worse, tied, pool) < 5 ? "tough" : "beat";
}

/** One eligible run in a date's pool. */
export interface PoolRun {
  /** The rank key (`scoring/ranking.ts`). */
  key: bigint;
  band: OffsetBand;
}

export interface PercentileInput {
  /** The player's run, eligible or not. */
  me: PoolRun & { eligible: boolean };
  /** Other players' eligible runs for the date; never the player's own. */
  others: readonly PoolRun[];
  /** `percentile_min_n`. */
  minN: number;
  /** False for an archive or challenge-only play: "You'd have beaten N%". */
  ranked: boolean;
  /** The date's global window is still open somewhere. */
  windowOpen: boolean;
}

export interface PercentileResult {
  view: PercentileView;
  /** For a shown ranked percentile; null otherwise. */
  headline: PercentileHeadline | null;
  scope: "band" | "all";
  /** N, B and T of the formula. */
  pool: number;
  worse: number;
  tied: number;
}

/** The stop screen's percentile, as `get_daily_numbers` computes it (§8.9). */
export function percentileView(input: PercentileInput): PercentileResult {
  const inBand = input.others.filter((run) => run.band === input.me.band);
  const bandCount = inBand.length + (input.me.eligible ? 1 : 0);
  const scope = bandCount >= input.minN ? "band" : "all";
  const pool = scope === "band" ? inBand : input.others;
  let worse = 0;
  let tied = 0;
  for (const run of pool) {
    if (run.key < input.me.key) worse += 1;
    else if (run.key === input.me.key) tied += 1;
  }
  const n = pool.length + 1;
  const shown = input.ranked
    ? n >= input.minN && n >= 2
    : pool.length >= Math.max(input.minN, 1);
  const value = shown ? percentile(worse, tied, n) : null;

  if (!input.ranked) {
    return {
      view: {
        status: "unranked",
        wouldHaveBeaten: value,
        windowOpen: input.windowOpen,
      },
      headline: null,
      scope,
      pool: n,
      worse,
      tied,
    };
  }
  if (value === null) {
    return {
      view: { status: "cold_start", finishers: n },
      headline: null,
      scope,
      pool: n,
      worse,
      tied,
    };
  }
  return {
    view: {
      status: "ready",
      percentile: value,
      pool: n,
      scope,
      final: !input.windowOpen,
    },
    headline: percentileHeadline(worse, tied, n),
    scope,
    pool: n,
    worse,
    tied,
  };
}

/**
 * Whole percentages that sum to 100 (largest remainder, PRD §4.1.5). All
 * zeros stay zeros. Equal remainders go to the earlier bucket.
 */
export function largestRemainder(counts: readonly number[]): number[] {
  for (const count of counts) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(
        "largestRemainder: counts must be whole numbers >= 0",
      );
    }
  }
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return counts.map(() => 0);
  const shares = counts.map((count) => Math.floor((100 * count) / total));
  let left = 100 - shares.reduce((sum, share) => sum + share, 0);
  const order = counts
    .map((count, index) => ({ index, remainder: (100 * count) % total }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left === 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

/** The flag bits stored on a run (§8.8). */
export const HONEST_PLAY_FLAGS = Object.freeze({
  hidden: 1,
  expertSlot: 2,
  tooFast: 4,
  missingReport: 8,
  zoneChange: 16,
  lowTrust: 32,
});

export interface HonestPlayRules {
  /** `honest_play_hidden_ms`: hidden time in one round that flags the run. */
  hiddenMs: number;
  /** `too_fast_ms`: a typed solve this soon after its clue flags the run. */
  tooFastMs: number;
  /** The expert-slot check: a clue-1 dwell above this multiple of the median... */
  expertMultiple: number;
  /** ...once this many such solves exist... */
  expertMinSolves: number;
  /** ...and before that, a dwell above this. */
  expertFallbackMs: number;
}

/** The launch values, equal to `src/config/shared.json` and `TUNABLES.timing`. */
export const DEFAULT_HONEST_PLAY: Readonly<HonestPlayRules> = Object.freeze({
  hiddenMs: 5000,
  tooFastMs: 1500,
  expertMultiple: 3,
  expertMinSolves: 50,
  expertFallbackMs: 120_000,
});

export interface HonestPlayRound {
  /** The largest hidden time the round's actions reported; null when one arrived without a report. */
  hiddenMs: number | null;
  /** How a Mystery was solved, and how long after its clue (or the options) appeared. */
  solve?: { by: "typed" | "pick"; msAfterClue: number } | null;
}

export interface HonestPlayRun {
  rounds: readonly HonestPlayRound[];
  /** The hardest-slot Mystery solved on clue 1: its clue-1 dwell, and the Daily's median dwell over its count of such solves. */
  expertSlot?: {
    dwellMs: number;
    medianDwellMs: number | null;
    solves: number;
  } | null;
  /** The device zone changed since the player's previous Daily (memo §14.1). */
  zoneChanged?: boolean;
  /** Finished by a low-trust identity (PRD §3.10.1). */
  lowTrust?: boolean;
}

export function honestPlayFlags(
  run: HonestPlayRun,
  rules: HonestPlayRules = DEFAULT_HONEST_PLAY,
): number {
  let flags = 0;
  for (const round of run.rounds) {
    if (round.hiddenMs === null) flags |= HONEST_PLAY_FLAGS.missingReport;
    else if (round.hiddenMs >= rules.hiddenMs)
      flags |= HONEST_PLAY_FLAGS.hidden;
    if (
      round.solve?.by === "typed" &&
      round.solve.msAfterClue <= rules.tooFastMs
    ) {
      flags |= HONEST_PLAY_FLAGS.tooFast;
    }
  }
  const expert = run.expertSlot;
  if (expert !== undefined && expert !== null) {
    const limit =
      expert.solves >= rules.expertMinSolves && expert.medianDwellMs !== null
        ? rules.expertMultiple * expert.medianDwellMs
        : rules.expertFallbackMs;
    if (expert.dwellMs > limit) flags |= HONEST_PLAY_FLAGS.expertSlot;
  }
  if (run.zoneChanged === true) flags |= HONEST_PLAY_FLAGS.zoneChange;
  if (run.lowTrust === true) flags |= HONEST_PLAY_FLAGS.lowTrust;
  return flags;
}

/** Eligible for the percentile pool, the histogram and crowd stats. */
export function isEligible(flags: number): boolean {
  return flags === 0;
}
