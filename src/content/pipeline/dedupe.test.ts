// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  countryId,
  fxFiles,
  fxMc,
  fxMystery,
  fxTf,
  loadFx,
  removeTempDirs,
} from "./__fixtures__/builders.ts";
import {
  DEDUPE_FLAG,
  buildDedupeIndex,
  contentTokens,
  dedupeEntry,
  flaggedPairs,
  guideExamples,
  nearestTo,
  pairScore,
} from "./dedupe.ts";
import { bankDedupeIndex } from "./lint/index.ts";

afterAll(removeTempDirs);

const stop = new Set(["the", "of", "in"]);
const entry = (raw: Record<string, unknown>) => {
  const out = dedupeEntry(raw, stop, "bank");
  if (!out) throw new Error("no entry");
  return out;
};

describe("dedupe scoring", () => {
  it("scores reworded copies high and unrelated items low", () => {
    const a = entry(fxMc() as unknown as Record<string, unknown>);
    const b = entry({
      ...fxMc(),
      id: "fx.p.geo.0104",
      stem: "In the fixture town of Halvessa, which instrument opens the spring festival?",
    });
    const c = entry(fxTf() as unknown as Record<string, unknown>);
    expect(pairScore(a, b).score).toBeGreaterThanOrEqual(0.85);
    expect(pairScore(a, c).score).toBeLessThan(DEDUPE_FLAG);
  });

  it("treats a shared answer as related even when the wording differs", () => {
    const a = entry(fxMc() as unknown as Record<string, unknown>);
    const b = entry({
      ...fxMc(),
      id: "fx.p.geo.0105",
      stem: "Which instrument do Halvessan players carve from heron bone?",
    });
    const { score, reason } = pairScore(a, b);
    expect(score).toBeGreaterThanOrEqual(DEDUPE_FLAG);
    expect(reason).toContain("same answer");
  });

  it("never lets two mysteries share an answer", () => {
    const a = entry(fxMystery() as unknown as Record<string, unknown>);
    const b = entry({
      ...fxMystery(),
      id: "fx.m.geo.0102",
      clues: [
        "Completely different clue one.",
        "Another clue.",
        "A third clue.",
        "A fourth clue.",
      ],
    });
    expect(pairScore(a, b)).toMatchObject({
      reason: expect.stringContaining("same mystery answer"),
    });
    expect(pairScore(a, b).score).toBeGreaterThanOrEqual(0.9);
    const c = entry({
      ...fxMystery(),
      id: "fx.m.geo.0103",
      answer: countryId("Fendara"),
    });
    expect(pairScore(a, c).reason).not.toContain("same mystery answer");
  });

  it("drops stopwords, question words and plurals", () => {
    expect(
      [
        ...contentTokens("Which of the rivers flows through Cindral?", stop),
      ].sort(),
    ).toEqual(["cindral", "flow", "river", "through"]);
  });

  it("finds the nearest neighbour and lists flagged pairs once", () => {
    const entries = [
      entry(fxMc() as unknown as Record<string, unknown>),
      entry({
        ...fxMc(),
        id: "fx.p.geo.0104",
        stem: "In Halvessa, which instrument opens the fixture spring festival?",
      }),
      entry(fxTf() as unknown as Record<string, unknown>),
    ];
    const index = buildDedupeIndex(entries);
    expect(nearestTo(index, 0).nearestId).toBe("fx.p.geo.0104");
    expect(flaggedPairs(index).map((pair) => [pair.a, pair.b])).toEqual([
      ["fx.p.geo.0101", "fx.p.geo.0104"],
    ]);
  });
});

describe("the guide's worked examples", () => {
  it("are read from CONTENT_GUIDE.md and include the Canberra item", () => {
    const markdown = readFileSync(
      join(REPO_ROOT, "docs/CONTENT_GUIDE.md"),
      "utf8",
    );
    const examples = guideExamples(markdown);
    expect(examples.length).toBeGreaterThan(30);
    expect(examples.map((example) => example.id)).toContain("p.geo.0001");
  });

  it("are part of the bank's index, so a copied example is caught", async () => {
    const bank = await loadFx(
      fxFiles({
        "practice/geography/fx.p.geo.0104.json": fxMc({
          id: "fx.p.geo.0104",
          stem: "What is the capital city of Australia?",
          answer: "Canberra",
          wrong: ["Sydney", "Melbourne", "Perth"],
        }),
      }),
    );
    const { index, positions } = bankDedupeIndex(bank, true);
    const match = nearestTo(index, positions.get("fx.p.geo.0104") ?? -1);
    expect(match.nearestId).toBe("guide:p.geo.0001");
    expect(match.score).toBeGreaterThanOrEqual(0.85);
  });
});
