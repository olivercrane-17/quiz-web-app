// @vitest-environment node
/**
 * Replays src/engine/fixtures/ranking.json (the AC-CHL-05 pairings and the
 * rank key's edges) and the timing rows of timing.json (request counting,
 * AC-DLY-23, totals), and checks the timing defaults against the shared
 * config SQL reads.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import ranking from "../fixtures/ranking.json";
import timing from "../fixtures/timing.json";
import type { EncoreDecimals, EncoreValueKind } from "../encore/value.ts";
import { encoreError, encoreRatio, type EncoreRatio } from "./encore.ts";
import {
  DEFAULT_TIMING,
  MAX_ERROR_MICROS,
  compareRuns,
  countRequests,
  effectiveRoundMs,
  encoreMicros,
  rankBy,
  rankKey,
  rankRuns,
  totalRunMs,
  type RankFacts,
  type RoundCall,
} from "./ranking.ts";
import { headToHead } from "./social.ts";

interface RawEncore {
  valueKind: string;
  answer: number;
  decimals: number;
}
interface RawSide {
  points: number;
  guess: number | null;
  totalMs: number;
}

const SHARED = JSON.parse(
  readFileSync(new URL("../../config/shared.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

function ratioOf(
  encore: RawEncore | null,
  guess: number | null,
): EncoreRatio | null {
  if (encore === null || guess === null) return null;
  return encoreRatio(
    encore.valueKind as EncoreValueKind,
    guess,
    encore.answer,
    encore.decimals as EncoreDecimals,
  );
}

function factsOf(encore: RawEncore | null, side: RawSide): RankFacts {
  return {
    points: side.points,
    encore: ratioOf(encore, side.guess),
    totalMs: side.totalMs,
  };
}

describe("ranking.json pairings", () => {
  it.each(ranking.pairings.map((row) => [row.title, row] as const))(
    "AC-CHL-05 %s",
    (_, row) => {
      const you = factsOf(row.encore, row.you);
      const them = factsOf(row.encore, row.them);
      expect(headToHead(you, them)).toEqual({
        winner: row.expect.winner,
        decidedBy: row.expect.decidedBy,
      });
      expect(encoreMicros(you.encore)).toBe(row.expect.youMicros);
      expect(encoreMicros(them.encore)).toBe(row.expect.themMicros);
      expect(rankKey(you).toString()).toBe(row.expect.youKey);
      expect(rankKey(them).toString()).toBe(row.expect.themKey);
      // The key, the comparator and the verdict always agree.
      const byKey =
        rankKey(you) > rankKey(them)
          ? -1
          : rankKey(you) < rankKey(them)
            ? 1
            : 0;
      expect(compareRuns(you, them)).toBe(byKey);
      expect(compareRuns(them, you)).toBe(byKey === 0 ? 0 : -byKey);
    },
  );

  it("AC-CHL-05 has 12 pairings, an exact tie among them", () => {
    expect(ranking.pairings).toHaveLength(12);
    expect(ranking.pairings.some((row) => row.expect.winner === "tie")).toBe(
      true,
    );
    expect(new Set(ranking.pairings.map((row) => row.id)).size).toBe(12);
  });
});

describe("ranking.json keys", () => {
  it.each(ranking.keys.map((row) => [row.title, row] as const))(
    "%s",
    (_, row) => {
      const runs = row.runs.map((run) => factsOf(row.encore, run));
      const expected = row.expect as {
        micros?: number[];
        keys?: string[];
        error?: string;
      };
      if (expected.error !== undefined) {
        for (const run of runs) expect(() => rankKey(run)).toThrow(RangeError);
        return;
      }
      expect(runs.map((run) => encoreMicros(run.encore))).toEqual(
        expected.micros,
      );
      expect(runs.map((run) => rankKey(run).toString())).toEqual(expected.keys);
    },
  );
});

describe("encore errors in millionths", () => {
  it("rounds the exact ratio half up where a float can land a hair under", () => {
    const exact = encoreRatio("quantity", 2000001, 2000000, 0);
    expect(encoreMicros(exact)).toBe(1);
    const float = encoreError("quantity", 2000001, 2000000, 0);
    // The float path is accepted for results that hold nothing else; it is
    // never more than one millionth from the exact one.
    expect(Math.abs(encoreMicros(float) - 1)).toBeLessThanOrEqual(1);
  });

  it("reads years and voided or absent Encores", () => {
    expect(encoreMicros(encoreRatio("year", 1966, 1969, 0))).toBe(3_000_000);
    expect(encoreMicros(encoreError("year", 1970, 1969, 0))).toBe(1_000_000);
    expect(encoreMicros(null)).toBe(0);
  });

  it("caps both ways of reading the error", () => {
    const huge = encoreRatio("quantity", 999_999_999_999_999, 1, 0);
    expect(encoreMicros(huge)).toBe(MAX_ERROR_MICROS);
    expect(
      encoreMicros({ kind: "relative", value: 1e12, display: "over 999% off" }),
    ).toBe(MAX_ERROR_MICROS);
  });

  it("refuses a ratio with no denominator", () => {
    expect(() =>
      encoreMicros({ kind: "relative", num: BigInt(1), den: BigInt(0) }),
    ).toThrow(RangeError);
  });
});

describe("rankRuns and rankBy", () => {
  it("share a rank between equal runs and skip the next", () => {
    const run = (points: number, totalMs: number): RankFacts => ({
      points,
      encore: null,
      totalMs,
    });
    const ranked = rankRuns([
      run(9, 300),
      run(11, 100),
      run(9, 300),
      run(8, 50),
    ]);
    expect(
      ranked.map((entry) => [entry.item.points, entry.rank, entry.tied]),
    ).toEqual([
      [11, 1, false],
      [9, 2, true],
      [9, 2, true],
      [8, 4, false],
    ]);
  });

  it("keep the input order inside a tie", () => {
    const ranked = rankBy(["b", "a", "c"], () => 0);
    expect(ranked.map((entry) => [entry.item, entry.rank])).toEqual([
      ["b", 1],
      ["a", 1],
      ["c", 1],
    ]);
  });

  it("refuses points a key can't hold", () => {
    expect(() => rankKey({ points: -1, encore: null, totalMs: 0 })).toThrow(
      RangeError,
    );
    expect(() => rankKey({ points: 2.5, encore: null, totalMs: 0 })).toThrow(
      RangeError,
    );
  });
});

describe("timing.json", () => {
  it("assumes the shared config SQL reads", () => {
    expect(timing.config.latencyAllowanceMs).toBe(SHARED.latencyAllowanceMs);
    expect(timing.config.roundCapMs).toBe(SHARED.roundCapMs);
    expect(DEFAULT_TIMING).toEqual({
      latencyAllowanceMs: SHARED.latencyAllowanceMs,
      roundCapMs: SHARED.roundCapMs,
    });
  });

  it.each(timing.requests.map((row) => [row.title, row] as const))(
    "counts requests: %s",
    (_, row) => {
      expect(countRequests(row.calls as RoundCall[])).toBe(row.requests);
    },
  );

  it.each(
    timing.rounds.map(
      (row) =>
        ["ac" in row ? `${row.ac} ${row.title}` : row.title, row] as const,
    ),
  )("%s", (_, row) => {
    const rules = {
      latencyAllowanceMs: timing.config.latencyAllowanceMs,
      roundCapMs: timing.config.roundCapMs,
    };
    expect(
      effectiveRoundMs(row.serverMs, row.clientMs, row.requests, rules),
    ).toBe(row.effectiveMs);
  });

  it.each(timing.totals.map((row) => [row.title, row] as const))(
    "totals: %s",
    (_, row) => {
      expect(totalRunMs(row.rounds)).toBe(row.totalMs);
    },
  );
});
