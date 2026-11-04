// @vitest-environment node
/**
 * Replays src/engine/fixtures/percentile.json (AC-DLY-20's pools, the
 * offset bands, the crowd shares) and the honest-play rows of timing.json
 * (AC-DLY-25 and the missing-report flag), with the thresholds read from
 * the shared config SQL reads.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import table from "../fixtures/percentile.json";
import timing from "../fixtures/timing.json";
import {
  DEFAULT_HONEST_PLAY,
  HONEST_PLAY_FLAGS,
  honestPlayFlags,
  isEligible,
  largestRemainder,
  offsetBand,
  percentile,
  percentileHeadline,
  percentileView,
  type HonestPlayRun,
  type OffsetBand,
  type PoolRun,
} from "./percentile.ts";

const SHARED = JSON.parse(
  readFileSync(new URL("../../config/shared.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const ME_KEY = BigInt(1_000_000);

interface RawGroup {
  band: number;
  vs: string;
  count: number;
}

function expand(groups: readonly RawGroup[]): PoolRun[] {
  const runs: PoolRun[] = [];
  for (const group of groups) {
    const key =
      group.vs === "worse"
        ? ME_KEY - BigInt(1)
        : group.vs === "better"
          ? ME_KEY + BigInt(1)
          : ME_KEY;
    for (let i = 0; i < group.count; i += 1) {
      runs.push({ key, band: group.band as OffsetBand });
    }
  }
  return runs;
}

const titleOf = (row: { ac?: string; title: string }) =>
  row.ac === undefined ? row.title : `${row.ac} ${row.title}`;

describe("percentile.json", () => {
  it("reads percentile_min_n from the shared config", () => {
    expect(table.minN).toBe(SHARED.percentileMinN);
  });

  it.each(table.pools.map((row) => [titleOf(row), row] as const))(
    "%s",
    (_, row) => {
      const result = percentileView({
        me: {
          key: ME_KEY,
          band: row.me.band as OffsetBand,
          eligible: row.me.eligible,
        },
        others: expand(row.others),
        minN: table.minN,
        ranked: row.ranked,
        windowOpen: row.windowOpen,
      });
      const expected = row.expect as Record<string, unknown>;
      for (const [key, value] of Object.entries(expected)) {
        expect(result[key as keyof typeof result], key).toEqual(value);
      }
    },
  );

  it.each(table.bands)("offset $offsetMinutes is band $band", (row) => {
    expect(offsetBand(row.offsetMinutes)).toBe(row.band);
  });

  it.each(table.shares.map((row) => [row.title, row] as const))(
    "crowd shares: %s",
    (_, row) => {
      const shares = largestRemainder(row.counts);
      expect(shares).toEqual(row.shares);
      if (row.counts.some((count) => count > 0)) {
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
      }
    },
  );
});

describe("the percentile formula", () => {
  it("is computed in integers, so exact halves don't drift", () => {
    expect(percentile(20, 9, 50)).toBe(50);
    expect(percentile(0, 1, 2)).toBe(50);
    expect(percentile(1, 0, 2)).toBe(100);
  });

  it("refuses counts the pool can't hold", () => {
    expect(() => percentile(49, 1, 50)).toThrow(RangeError);
    expect(() => percentile(0, 0, 1)).toThrow(RangeError);
    expect(() => percentile(-1, 0, 50)).toThrow(RangeError);
    expect(() => percentile(1.5, 0, 50)).toThrow(RangeError);
  });

  it("picks the headline by the copy rules", () => {
    expect(percentileHeadline(49, 0, 50)).toBe("nobody_better");
    expect(percentileHeadline(0, 49, 50)).toBe("nobody_better");
    expect(percentileHeadline(2, 0, 50)).toBe("tough");
    expect(percentileHeadline(3, 0, 50)).toBe("beat");
  });

  it("refuses counts that aren't whole numbers for crowd shares", () => {
    expect(() => largestRemainder([1, -1])).toThrow(RangeError);
    expect(() => largestRemainder([0.5])).toThrow(RangeError);
  });
});

describe("timing.json honest play", () => {
  const rules = {
    ...DEFAULT_HONEST_PLAY,
    hiddenMs: timing.config.honestPlayHiddenMs,
    tooFastMs: timing.config.tooFastMs,
  };

  it("AC-DLY-25 reads honest_play_hidden_ms and too_fast_ms from the shared config", () => {
    expect(timing.config.honestPlayHiddenMs).toBe(SHARED.honestPlayHiddenMs);
    expect(timing.config.tooFastMs).toBe(SHARED.tooFastMs);
    expect(DEFAULT_HONEST_PLAY.hiddenMs).toBe(SHARED.honestPlayHiddenMs);
    expect(DEFAULT_HONEST_PLAY.tooFastMs).toBe(SHARED.tooFastMs);
  });

  it.each(timing.honestPlay.map((row) => [titleOf(row), row] as const))(
    "%s",
    (_, row) => {
      const flags = honestPlayFlags(row.run as HonestPlayRun, rules);
      expect(flags).toBe(row.flags);
      expect(isEligible(flags)).toBe(row.flags === 0);
    },
  );

  it("names the stored flag bits", () => {
    expect(HONEST_PLAY_FLAGS).toEqual({
      hidden: 1,
      expertSlot: 2,
      tooFast: 4,
      missingReport: 8,
      zoneChange: 16,
      lowTrust: 32,
    });
  });

  it("uses the launch thresholds when no rules are passed", () => {
    expect(
      honestPlayFlags({ rounds: [{ hiddenMs: 5000 }, { hiddenMs: 0 }] }),
    ).toBe(HONEST_PLAY_FLAGS.hidden);
    expect(honestPlayFlags({ rounds: [], expertSlot: null })).toBe(0);
  });
});
