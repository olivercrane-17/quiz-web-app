// @vitest-environment node
/**
 * scripts/checks/ac-coverage.mjs (ARCHITECTURE §11.9): titles on planted
 * trees, the report and its exit codes, then a run over the repository.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { acCoverage, leadingAcIds, titlesIn } from "./ac-coverage.mjs";

const REPO = process.cwd();
const SCRIPT = resolve(REPO, "scripts/checks/ac-coverage.mjs");
const temps: string[] = [];

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repository holding `files` (path → text), with the script in it. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "qz-ac-"));
  temps.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  mkdirSync(join(root, "scripts/checks"), { recursive: true });
  cpSync(SCRIPT, join(root, "scripts/checks/ac-coverage.mjs"));
  return root;
}

const PRD = [
  "# PRD",
  "- **AC-DLY-01** Given a guest, when they tap Play, then clue 1 shows.",
  "- **AC-DLY-02** Given a finish, then the stop screen shows.",
  "- **AC-DLY-07b** Given a miss, then the reveal shows.",
  "- **AC-ROM-01** Given five phones, then all join.",
  "",
].join("\n");

const PLANTED = {
  "docs/PRD.md": PRD,
  "docs/ARCHITECTURE.md": "Covered by AC-DLY-01 and AC-ZZZ-09.\n",
  "e2e/daily.spec.ts": [
    'test("AC-DLY-01 one tap on Play opens clue 1", async () => {});',
    "test.fixme(`AC-DLY-02 the stop screen, later`, async () => {});",
    "",
  ].join("\n"),
  "src/reveal.test.tsx": [
    'it.each([1, 2])("R1-16 AC-DLY-07b, the reveal %s", () => {});',
    "// AC-ROM-01 named in a comment only",
    'it("shows AC-ROM-01 mid-title, which does not count", () => {});',
    "",
  ].join("\n"),
};

describe("titles", () => {
  it("reads the ids that open a title, after other ids, and stops at the first word", () => {
    expect(leadingAcIds("AC-DLY-01 one tap")).toEqual(["AC-DLY-01"]);
    expect(
      leadingAcIds("R2-09 AC-SHR-02, AC-SHR-03 and AC-SHR-04: lines"),
    ).toEqual(["AC-SHR-02", "AC-SHR-03", "AC-SHR-04"]);
    expect(leadingAcIds("the stop screen (AC-DLY-14)")).toEqual([]);
    expect(leadingAcIds("D22 R2-09 ends a miss")).toEqual([]);
  });

  it("finds Vitest, Playwright and SQL titles, and marks skipped ones", () => {
    expect(
      titlesIn(
        [
          'it("AC-A-1 x", () => {});',
          "test.skip('AC-A-2 y', () => {});",
          "describe.each([[1]])(`AC-A-3 z`, () => {});",
          'test.describe.serial("AC-A-4 w", () => {});',
        ].join("\n"),
      ),
    ).toEqual([
      { ids: ["AC-A-1"], skipped: false },
      { ids: ["AC-A-2"], skipped: true },
      { ids: ["AC-A-3"], skipped: false },
      { ids: ["AC-A-4"], skipped: false },
    ]);
    expect(
      titlesIn("select 'PASS AC-IDN-04 thirty registrations pass';", true),
    ).toEqual([{ ids: ["AC-IDN-04"], skipped: false }]);
  });
});

describe("the report", () => {
  it("names the criteria with no test, those only skipped tests name, and ids PRD.md doesn't define", () => {
    const root = tree(PLANTED);
    const report = acCoverage(root);
    expect(report.defined).toBe(4);
    expect(report.covered).toBe(2);
    expect(report.missing).toEqual(["AC-ROM-01"]);
    expect(report.skippedOnly).toEqual(["AC-DLY-02"]);
    expect(report.undefinedIds).toEqual([
      { id: "AC-ZZZ-09", docs: ["docs/ARCHITECTURE.md"] },
    ]);
    expect(acCoverage(root, ["AC-DLY"]).missing).toEqual([]);
  });

  it("only reports by default, fails with --strict on a gap, and refuses a bad option", () => {
    const root = tree(PLANTED);
    const run = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [join(root, "scripts/checks/ac-coverage.mjs"), ...args],
        { encoding: "utf8" },
      );
    const plain = run();
    expect(plain.status).toBe(0);
    expect(plain.stdout).toContain("no test: AC-ROM-01");
    expect(plain.stdout).toContain("only skipped tests: AC-DLY-02");
    expect(plain.stdout).toContain(
      "check:ac: 2 of 4 acceptance criteria have a test whose title starts with their id; 1 have none, 1 only skipped ones.",
    );
    expect(run("--strict").status).toBe(1);
    expect(run("--strict", "--only", "AC-ROM").status).toBe(1);
    const json = run("--json", "--strict", "--only", "AC-DLY-01");
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({
      ok: true,
      defined: 1,
      covered: 1,
    });
    expect(run("--nope").status).toBe(2);
    expect(run("--only").status).toBe(2);
  });
});

describe("the repository", () => {
  it("reads every criterion PRD.md defines, and every id the docs name is one of them", () => {
    const report = acCoverage(REPO);
    expect(report.defined).toBeGreaterThan(200);
    expect(report.covered).toBeGreaterThan(0);
    expect(report.undefinedIds).toEqual([]);
  });
});
