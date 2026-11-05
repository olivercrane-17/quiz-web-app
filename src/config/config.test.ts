import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import raw from "./shared.json";
import { FEATURE_DEFAULTS, FEATURE_FLAGS, isFeatureFlag } from "./features";
import { DAILY_EPOCH, SHARED, parseSharedConfig } from "./shared";
import { SUGGESTION_COUNT, TUNABLES } from "./tunables";

describe("shared config", () => {
  it("holds the values client and SQL agree on (§5.3)", () => {
    expect(SHARED).toEqual({
      dailyEpoch: "2026-09-21",
      crowdMinN: 50,
      percentileMinN: 50,
      encoreBands: {
        quantity: { bullseye: 0.05, close: 0.15 },
        year: { bullseye: 2, close: 5 },
      },
      latencyAllowanceMs: 400,
      roundCapMs: 900_000,
      optionsFromClue: 4,
      honestPlayHiddenMs: 5000,
      tooFastMs: 1500,
      dailyMinutes: 4,
      blitzSeconds: 60,
    });
    expect(DAILY_EPOCH).toBe("2026-09-21");
    expect(Object.isFrozen(SHARED)).toBe(true);
  });

  it("refuses values that would split the client from SQL", () => {
    expect(() =>
      parseSharedConfig({ ...raw, dailyEpoch: "21/09/2026" }),
    ).toThrow(/dailyEpoch/);
    expect(() => parseSharedConfig({ ...raw, optionsFromClue: 2 })).toThrow(
      /optionsFromClue/,
    );
    expect(() => parseSharedConfig({ ...raw, crowdMinN: 0 })).toThrow(
      /crowdMinN/,
    );
    expect(() => parseSharedConfig({ ...raw, roundCapMs: 1.5 })).toThrow(
      /roundCapMs/,
    );
    expect(() =>
      parseSharedConfig({
        ...raw,
        encoreBands: {
          ...raw.encoreBands,
          quantity: { bullseye: 0.2, close: 0.15 },
        },
      }),
    ).toThrow(/encoreBands.quantity/);
    expect(() => parseSharedConfig(null)).toThrow();
  });
});

describe("tunables", () => {
  it("carries the PRD's starting values", () => {
    expect(TUNABLES.answers).toEqual({ buttonMinHeightPx: 56, revealMs: 400 });
    expect(TUNABLES.daily.minutes).toBe(4);
    expect(TUNABLES.daily.optionsFromClue).toBe(4);
    expect(TUNABLES.practice).toEqual({ easyMinP: 0.75, hardMaxP: 0.45 });
    expect(TUNABLES.blitz).toMatchObject({
      seconds: 60,
      verdictFlashMs: 600,
      basePoints: 100,
      speedBonusPoints: 50,
      speedWindowMs: 8000,
    });
    expect(TUNABLES.survival).toEqual({ easyThrough: 5, mediumThrough: 12 });
    expect(TUNABLES.crowd).toEqual({ minN: 50, percentileMinN: 50 });
    expect(TUNABLES.timing).toMatchObject({
      roundCapMs: 900_000,
      honestPlayHiddenMs: 5000,
      tooFastMs: 1500,
      expertSlotFallbackDwellMs: 120_000,
    });
    expect(TUNABLES.rooms).toMatchObject({
      readBeatMsPerWord: 250,
      readBeatMinMs: 1500,
      readBeatMaxMs: 5000,
      hostGoneEndsMs: 900_000,
    });
    expect(
      TUNABLES.mastery.tiers.map((t) => [t.tier, t.distinct, t.accuracy]),
    ).toEqual([
      ["bronze", 20, 0.5],
      ["silver", 40, 0.6],
      ["gold", 70, 0.7],
      ["platinum", 100, 0.8],
    ]);
    expect(TUNABLES.identity).toMatchObject({
      normalTrustPerIpPerHour: 60,
      burstPerIpPerMinute: 20,
      projectPerHour: 5000,
    });
    expect(TUNABLES.shed).toEqual({ onAtMb: 380, offBelowMb: 340 });
    expect(SUGGESTION_COUNT).toBe(6);
  });

  it("takes shared values from shared.json, never a second copy", () => {
    expect(TUNABLES.encoreBands).toBe(SHARED.encoreBands);
    expect(TUNABLES.blitz.seconds).toBe(SHARED.blitzSeconds);
    expect(TUNABLES.timing.latencyAllowanceMs).toBe(SHARED.latencyAllowanceMs);
  });
});

describe("feature flags", () => {
  it("names the flags of §10.5", () => {
    expect(FEATURE_FLAGS).toEqual([
      "rooms",
      "editor",
      "blitz",
      "survival",
      "review",
      "mastery",
      "achievements",
      "calendar",
      "install_pitch",
      "category_pages",
      "monthly_pack",
      "read_aloud",
      "readable_text",
      "high_contrast",
    ]);
    expect(Object.keys(FEATURE_DEFAULTS).sort()).toEqual(
      [...FEATURE_FLAGS].sort(),
    );
    expect(isFeatureFlag("rooms")).toBe(true);
    expect(isFeatureFlag("adaptive_mixed")).toBe(false);
  });

  // No assertion here pins a default's value: owners flip their own file
  // when a feature ships, and this test must not need their edits.
  it("takes every default from exactly one owner file under flags/", async () => {
    const dir = resolve(process.cwd(), "src/config/flags");
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));
    const owners = new Map<string, string>();
    const merged: Record<string, unknown> = {};
    for (const file of files) {
      const loaded = (await import(
        /* @vite-ignore */ resolve(dir, file)
      )) as Record<string, Record<string, unknown>>;
      const exported = Object.values(loaded);
      expect(exported, file).toHaveLength(1);
      for (const [flag, value] of Object.entries(exported[0] ?? {})) {
        expect(owners.get(flag), `${flag} in ${file}`).toBeUndefined();
        owners.set(flag, file);
        expect(typeof value).toBe("boolean");
        merged[flag] = value;
      }
    }
    expect([...owners.keys()].sort()).toEqual([...FEATURE_FLAGS].sort());
    expect(FEATURE_DEFAULTS).toEqual(merged);
    expect(Object.isFrozen(FEATURE_DEFAULTS)).toBe(true);
  });
});
