// @vitest-environment node
/**
 * content:check through its CLI (ARCHITECTURE §5.7): what QA-2's launch
 * check (`--launch`) reports on an accepted item that breaks a rule CNT-2
 * added. Before launch the item, accepted before the rules landed, warns;
 * with --launch the same finding is an error and the run fails.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  removeTempDirs,
  tempDir,
} from "../../src/content/pipeline/__fixtures__/builders.ts";

afterAll(removeTempDirs);

function run(repo: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      join(REPO_ROOT, "scripts/content/check.ts"),
      ...args,
    ],
    {
      cwd: repo,
      encoding: "utf8",
      // Never the machine's own key: HOME is the throwaway repository.
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: repo },
    },
  );
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
}

describe("content:check --launch", () => {
  it("AC-CNT-01 reports CNT-2's rules as errors on active items, so the launch check fails", () => {
    const repo = tempDir("qz-check-launch-");
    writeFileSync(join(repo, "package.json"), "{}\n");
    for (const path of [
      "content/categories.json",
      "content/batches.json",
      "content/compositions.json",
      "content/reference",
      "content/datasets/manifest.json",
      "src/config/shared.json",
    ])
      cpSync(join(REPO_ROOT, path), join(repo, path), { recursive: true });
    // A real accepted item, with one claim below the risk floor (C26): its
    // text holds a number word, but the claim says standard.
    const path = "content/practice/geography/p.geo.0101.json";
    const item = JSON.parse(
      readFileSync(join(REPO_ROOT, path), "utf8"),
    ) as Record<string, unknown> & {
      claims: Record<string, unknown>[];
    };
    const [first, ...rest] = item.claims;
    const { riskReason: _reason, ...below } = first ?? {};
    const broken = {
      ...item,
      claims: [{ ...below, risk: "standard" }, ...rest],
    };
    mkdirSync(join(repo, "content/practice/geography"), { recursive: true });
    writeFileSync(join(repo, path), `${JSON.stringify(broken, null, 2)}\n`);

    const args = ["--skip-drift", "--skip-dedupe", "--today", "2026-11-04"];
    const c26 = (out: string) =>
      out
        .split("\n")
        .filter((line) => / C26 .*p\.geo\.0101 claims\[0\]/.test(line))
        .map((line) => line.slice(0, 5).trim());
    // Accepted on 1 November, before the rules landed: a warning...
    const before = run(repo, ...args);
    expect(c26(before.out)).toEqual(["warn"]);
    // ...and an error in QA-2's launch check, which then fails.
    const launch = run(repo, ...args, "--launch");
    expect(launch.code).toBe(1);
    expect(c26(launch.out)).toEqual(["error"]);
  }, 60_000);
});
