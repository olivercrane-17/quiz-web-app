// @vitest-environment node
/**
 * Replays src/engine/fixtures/share-codes.json (round trips, capacities,
 * malformed codes) against the layouts of content/compositions.json, and
 * checks AC-SHR-03 over 10,000 seeded random results.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import table from "../fixtures/share-codes.json";
import { createRng, type Rng } from "../rng.ts";
import type { CategoryId } from "../types/content.ts";
import { parseDailyNumber, type DailyNumber } from "../types/ids.ts";
import type {
  EncoreBand,
  EncoreError,
  RoundOutcome,
  RoundType,
} from "../types/rounds.ts";
import { mysteryCells } from "../run/outcome.ts";
import {
  ENCORE_TOKEN,
  SHARE_CATEGORIES,
  compositionRounds,
  decodeShareCode,
  encodeShareCode,
  encoreTokenDisplay,
  encoreTokenOf,
  fitsShareCode,
  parseShareLayouts,
  payloadCapacity,
  sharePath,
  type DecodedShare,
} from "./code.ts";
import { shareRows } from "./text.ts";

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const LAYOUTS = parseShareLayouts(
  readJson("../../../content/compositions.json"),
);
const CATEGORIES = readJson("../../../content/categories.json") as {
  id: string;
}[];

interface RawRound {
  type: string;
  category?: string;
  solvedOn?: number | null;
  correct?: boolean;
  display?: string | null;
  band?: string | null;
  voided: boolean;
}

function dailyNumber(value: number): DailyNumber {
  const number = parseDailyNumber(value);
  if (number === null) throw new Error(`bad Daily number ${value}`);
  return number;
}

function errorOf(display: string): EncoreError {
  const years = /year/.test(display);
  return { kind: years ? "years" : "relative", value: 0.5, display };
}

function outcomeOf(round: RawRound): RoundOutcome {
  if (round.type === "mystery") {
    const solvedOn = (round.solvedOn ?? null) as 1 | 2 | 3 | 4 | null;
    return {
      family: "mystery",
      solvedOn,
      points: round.voided ? 4 : solvedOn === null ? 0 : 5 - solvedOn,
      voided: round.voided,
      category: round.category as CategoryId,
      cells: round.voided
        ? ["voided", "voided", "voided", "voided"]
        : mysteryCells(solvedOn),
    };
  }
  if (round.type === "encore") {
    return {
      family: "encore",
      error: round.voided || !round.display ? null : errorOf(round.display),
      band: (round.band ?? null) as EncoreBand,
      voided: round.voided,
    };
  }
  const correct = round.correct === true;
  return {
    family: "choice",
    correct,
    points: round.voided || correct ? 1 : 0,
    voided: round.voided,
    answerMs: null,
    cells: [round.voided ? "voided" : correct ? "correct" : "wrong"],
  };
}

/** What decoding must give back for the outcomes that were encoded. */
function expectedRounds(outcomes: readonly RoundOutcome[]): unknown[] {
  return outcomes.map((outcome) => {
    if (outcome.family === "mystery") {
      return [
        "mystery",
        outcome.voided ? null : outcome.solvedOn,
        outcome.voided,
        outcome.category,
        outcome.points,
      ];
    }
    if (outcome.family === "choice") {
      return [
        "choice",
        outcome.voided ? false : outcome.correct,
        outcome.voided,
      ];
    }
    const voided = outcome.voided || outcome.error === null;
    return [
      "encore",
      voided,
      voided ? null : (outcome.error?.display ?? null),
      voided ? null : outcome.band,
    ];
  });
}

function decodedRounds(decoded: DecodedShare): unknown[] {
  return decoded.rounds.map((round) => {
    if (round.family === "mystery") {
      return [
        "mystery",
        round.solvedOn,
        round.voided,
        round.category,
        round.points,
      ];
    }
    if (round.family === "choice")
      return ["choice", round.correct, round.voided];
    return ["encore", round.voided, round.display, round.band];
  });
}

function expectMatches(
  decoded: DecodedShare,
  outcomes: readonly RoundOutcome[],
) {
  expect(decoded.rows).toEqual(shareRows(outcomes));
  expect(decodedRounds(decoded)).toEqual(expectedRounds(outcomes));
}

/** The same check without assertions, for the 10,000-result loop. */
function matches(decoded: DecodedShare, outcomes: readonly RoundOutcome[]) {
  return (
    JSON.stringify(decoded.rows) === JSON.stringify(shareRows(outcomes)) &&
    JSON.stringify(decodedRounds(decoded)) ===
      JSON.stringify(expectedRounds(outcomes))
  );
}

describe("share-codes.json round trips", () => {
  it.each(table.roundTrips.map((row) => [row.title, row] as const))(
    "%s",
    (_, row) => {
      const outcomes = row.rounds.map((round) => outcomeOf(round as RawRound));
      const code = encodeShareCode(
        { composition: row.composition, archive: row.archive, outcomes },
        LAYOUTS,
      );
      expect(code).toBe(row.code);
      const decoded = decodeShareCode(row.number, code, LAYOUTS);
      expect(decoded).not.toBeNull();
      if (decoded === null) return;
      expect([
        decoded.dailyNumber,
        decoded.composition,
        decoded.archive,
        decoded.points,
        decoded.maxPoints,
      ]).toEqual([
        row.number,
        row.composition,
        row.archive,
        row.points,
        row.maxPoints,
      ]);
      expectMatches(decoded, outcomes);
      expect(sharePath(dailyNumber(row.number), code)).toBe(
        `/s/${row.number}/${row.code}`,
      );
    },
  );
});

describe("share-codes.json capacities", () => {
  it.each(table.capacities)("$composition fits: $fits", (row) => {
    const capacity = payloadCapacity(row.composition);
    expect(capacity?.toString() ?? null).toBe(row.capacity);
    expect(fitsShareCode(row.composition)).toBe(row.fits);
    if (capacity !== null) {
      expect((capacity - BigInt(1)).toString(36)).toBe(row.largestPayload);
    }
  });

  it("fits the largest real m3e1 result in 8 characters, and refuses the impossible top payload", () => {
    const voided = { type: "mystery", category: "soc", voided: true } as const;
    const outcomes = [voided, voided, voided].map((round) => outcomeOf(round));
    outcomes.push(
      outcomeOf({
        type: "encore",
        display: "9999 years off",
        band: "bullseye",
        voided: false,
      }),
    );
    const code = encodeShareCode(
      { composition: "m3e1", archive: true, outcomes },
      LAYOUTS,
    );
    expect(code).toMatch(/^a[0-9a-z]{7}$/);
    expect(decodeShareCode(42, code, LAYOUTS)?.points).toBe(12);
    // Every digit at its top means a voided Encore with the bullseye band.
    expect(decodeShareCode(42, "abbfzzzz", LAYOUTS)).toBeNull();
    expect(decodeShareCode(42, "abbg0000", LAYOUTS)).toBeNull();
  });
});

describe("share-codes.json malformed codes", () => {
  it.each(table.malformed.map((row) => [row.title, row] as const))(
    "decodes %s as null",
    (_, row) => {
      expect(decodeShareCode(row.number, row.code, LAYOUTS)).toBeNull();
    },
  );

  it("decodes non-string input as null", () => {
    expect(decodeShareCode(42, 7 as unknown as string, LAYOUTS)).toBeNull();
  });
});

function randomOutcome(rng: Rng, type: RoundType): RoundOutcome {
  if (type === "mystery") {
    const voided = rng.int(10) === 0;
    const solvedOn = ([null, 1, 2, 3, 4] as const)[rng.int(5)] ?? null;
    return outcomeOf({
      type,
      category: rng.pick(SHARE_CATEGORIES),
      solvedOn,
      voided,
    });
  }
  if (type === "encore") {
    if (rng.int(12) === 0) return outcomeOf({ type, voided: true });
    const token = rng.int(ENCORE_TOKEN.voided);
    const display = encoreTokenDisplay(token) ?? "Spot on";
    const band: EncoreBand =
      token === ENCORE_TOKEN.spotOn
        ? "bullseye"
        : (([null, "close", "bullseye"] as const)[rng.int(3)] ?? null);
    return outcomeOf({ type, display, band, voided: false });
  }
  return outcomeOf({
    type,
    correct: rng.int(2) === 1,
    voided: rng.int(10) === 0,
  });
}

describe("AC-SHR-03", () => {
  it("AC-SHR-03 every generated share URL matches ^/s/\\d+/[0-9a-z]{1,8}$ with no ? or #, over 10,000 random results", () => {
    const rng = createRng("share-codes-ac-shr-03");
    const compositions = [...LAYOUTS.codeOf.keys()];
    const pattern = /^\/s\/\d+\/[0-9a-z]{1,8}$/;
    const failures: string[] = [];
    let checked = 0;
    for (let i = 0; i < 10_000; i += 1) {
      // Most results are v1 Dailies; the rest exercise the other layouts.
      const composition = i % 4 === 3 ? rng.pick(compositions) : "m3e1";
      const rounds = compositionRounds(composition) ?? [];
      const outcomes = rounds.map((type) => randomOutcome(rng, type));
      const archive = rng.int(2) === 1;
      const number = 1 + rng.int(9999);
      const code = encodeShareCode({ composition, archive, outcomes }, LAYOUTS);
      const path = sharePath(dailyNumber(number), code);
      const decoded = decodeShareCode(number, code, LAYOUTS);
      const ok =
        pattern.test(path) &&
        !/[?#]/.test(path) &&
        decoded !== null &&
        decoded.composition === composition &&
        decoded.archive === archive &&
        matches(decoded, outcomes);
      if (!ok) failures.push(path);
      checked += 1;
    }
    expect(failures).toEqual([]);
    expect(checked).toBe(10_000);
  }, 30_000);
});

describe("parseShareLayouts", () => {
  it("reads content/compositions.json: a is m3e1", () => {
    expect(LAYOUTS.codeOf.get("m3e1")).toBe("a");
    expect(LAYOUTS.compositionOf.get("a")).toBe("m3e1");
  });

  it.each([
    ["not an object", null],
    ["layouts as a list", { layouts: [] }],
    ["an ordering round", { layouts: { o1e1: "a" } }],
    ["a malformed id", { layouts: { m0e1: "a" } }],
    ["a composition that can't fit", { layouts: { m4e1: "a" } }],
    ["a two-character code", { layouts: { m3e1: "ab" } }],
    ["an upper-case code", { layouts: { m3e1: "A" } }],
    ["a code used twice", { layouts: { m3e1: "a", c9e1: "a" } }],
  ])("refuses %s", (_, raw) => {
    expect(() => parseShareLayouts(raw)).toThrow(/compositions\.json/);
  });
});

describe("the category digit", () => {
  it("covers every category exactly once", () => {
    expect([...SHARE_CATEGORIES].sort()).toEqual(
      CATEGORIES.map((category) => category.id).sort(),
    );
    expect(new Set(SHARE_CATEGORIES).size).toBe(12);
  });
});

describe("Encore tokens", () => {
  it.each([
    ["Spot on", 0],
    ["under 1% off", 1],
    ["1% off", 2],
    ["4% off", 5],
    ["998% off", 999],
    ["over 999% off", 1000],
    ["1 year off", 1001],
    ["3 years off", 1003],
    ["9999 years off", 10999],
  ])("%s is token %d and back", (display, token) => {
    expect(encoreTokenOf(errorOf(display))).toBe(token);
    expect(encoreTokenDisplay(token)).toBe(display);
  });

  it("falls back to the value for a display it doesn't know", () => {
    const odd = (kind: EncoreError["kind"], value: number) =>
      encoreTokenOf({ kind, value, display: "?" });
    expect(odd("relative", 0)).toBe(0);
    expect(odd("relative", 0.005)).toBe(1);
    expect(odd("relative", 0.0425)).toBe(5);
    expect(odd("relative", 12)).toBe(1000);
    expect(odd("years", 0)).toBe(0);
    expect(odd("years", 3)).toBe(1003);
    expect(odd("years", 20_000)).toBe(10999);
  });

  it("has no display past the voided token", () => {
    expect(encoreTokenDisplay(ENCORE_TOKEN.voided)).toBeNull();
    expect(() => encoreTokenDisplay(-1)).toThrow(RangeError);
    expect(() => encoreTokenDisplay(11_001)).toThrow(RangeError);
  });
});

describe("encodeShareCode refuses", () => {
  const m3e1 = table.roundTrips[0];
  const outcomes = (m3e1?.rounds ?? []).map((round) =>
    outcomeOf(round as RawRound),
  );

  it("a composition with no layout", () => {
    expect(() =>
      encodeShareCode(
        { composition: "c12e1", archive: false, outcomes },
        LAYOUTS,
      ),
    ).toThrow(RangeError);
  });

  it("outcomes that don't match the composition", () => {
    expect(() =>
      encodeShareCode(
        { composition: "m3e1", archive: false, outcomes: outcomes.slice(1) },
        LAYOUTS,
      ),
    ).toThrow(RangeError);
    expect(() =>
      encodeShareCode(
        {
          composition: "m3e1",
          archive: false,
          outcomes: [...outcomes].reverse(),
        },
        LAYOUTS,
      ),
    ).toThrow(RangeError);
  });

  it("a category the code has no digit for", () => {
    const [first, ...rest] = outcomes;
    if (first?.family !== "mystery") throw new Error("fixture changed");
    const odd = { ...first, category: "xyz" as CategoryId };
    expect(() =>
      encodeShareCode(
        { composition: "m3e1", archive: false, outcomes: [odd, ...rest] },
        LAYOUTS,
      ),
    ).toThrow(RangeError);
  });
});
