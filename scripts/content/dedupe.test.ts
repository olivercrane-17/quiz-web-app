// @vitest-environment node
/**
 * content:dedupe through its CLI, the way CI runs it over the fixture tree
 * (`--cross-pool --fixtures --root content/fixtures`, RITE round 2's
 * R2-22): the fixture Mysteries and Encores count as Daily items, so a
 * practice item that states one's fact fails the run with X29.
 */
import { spawnSync } from "node:child_process";
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  removeTempDirs,
  tempDir,
} from "../../src/content/pipeline/__fixtures__/builders.ts";

afterAll(removeTempDirs);

function dedupe(...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      join(REPO_ROOT, "scripts/content/dedupe.ts"),
      ...args,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // Never the machine's own key: HOME is a throwaway folder.
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
        HOME: tempDir("qz-dedupe-home-"),
      },
    },
  );
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
}

/**
 * fx.p.hist.0105 as round 2 played it: its explanation and its revealed
 * value give the year the Gorlund Games began, 1388, which Daily #47's
 * Encore (fx.e.0102) asked for. Marcus scored a bullseye from memory.
 */
const OLD_HIST_0105 = {
  id: "fx.p.hist.0105",
  status: "draft",
  category: "hist",
  tags: ["fixtures", "dates"],
  region: "global",
  volatility: "evergreen",
  reviewBy: null,
  seededDifficulty: 3,
  counterintuitive: false,
  explanation:
    "Cindral received its charter in 1204, while the Gorlund Games began 184 years later, in 1388.",
  learnMore: "Charter of Cindral (fixture)",
  claims: [
    {
      id: "c1",
      role: "label",
      ref: "a",
      risk: "standard",
      text: "The Cindral charter: 1204.",
    },
    {
      id: "c2",
      role: "label",
      ref: "b",
      risk: "standard",
      text: "The Gorlund Games: 1388.",
    },
    {
      id: "c3",
      role: "explanation",
      risk: "standard",
      text: "Cindral received its charter in 1204, while the Gorlund Games began 184 years later, in 1388.",
    },
  ],
  writerNotes:
    "Invented fixture for tests, the mock backend and the e2e track (ARCHITECTURE 5.6). Not a real fact; never scheduled on the main track.",
  format: "comparison",
  stem: "Which came first?",
  a: "The Cindral charter",
  b: "The Gorlund Games",
  answer: "a",
  relation: "earlier",
  measure: "year",
  unit: "year",
  values: { a: 1204, b: 1388 },
  valueDisplay: { a: "1204", b: "1388" },
  predicted: { p: 0.7, spread: 0.2, estimator: "fixture" },
};

describe("content:dedupe --fixtures (RITE round 2)", () => {
  it("R2-22 runs the cross-pool check over content/fixtures, and the fixture tree passes it", () => {
    const run = dedupe(
      "--cross-pool",
      "--fixtures",
      "--root",
      "content/fixtures",
    );
    expect(run.out).not.toContain("not run");
    expect(run.out).toContain(
      "0 Daily item(s) share a fact with a practice or room item (X29).",
    );
    expect(run.out).not.toMatch(/error X29/);
    expect(run.code).toBe(0);
    // One child process loading the fixture tree and the guide: about a
    // second alone, several under shared-CPU load, past Vitest's 5 s.
  }, 60_000);

  it("R2-22 fails with X29 on fx.p.hist.0105 as round 2 played it, naming the Encore it gave away", () => {
    const tree = tempDir("qz-fixtures-r2-22-");
    cpSync(join(REPO_ROOT, "content/fixtures"), tree, { recursive: true });
    writeFileSync(
      join(tree, "practice/history/fx.p.hist.0105.json"),
      `${JSON.stringify(OLD_HIST_0105, null, 2)}\n`,
    );
    const run = dedupe("--cross-pool", "--fixtures", "--root", tree);
    expect(run.out).toMatch(
      /error X29 fx\.e\.0102: AC-CNT-06: fx\.p\.hist\.0105 states this Encore's answer/,
    );
    expect(run.out).toContain(
      "1 Daily item(s) share a fact with a practice or room item (X29).",
    );
    expect(run.code).toBe(1);

    // --json says the same, for scripts.
    const json = dedupe("--cross-pool", "--fixtures", "--root", tree, "--json");
    const report = JSON.parse(json.out.slice(json.out.indexOf("{"))) as {
      ok: boolean;
      crossPoolRan: boolean;
      crossPool: { itemId: string | null; rule: string }[];
    };
    expect(report).toMatchObject({ ok: false, crossPoolRan: true });
    expect(report.crossPool).toEqual([
      expect.objectContaining({ itemId: "fx.e.0102", rule: "X29" }),
    ]);
  }, 60_000);
});
