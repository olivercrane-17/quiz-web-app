// @vitest-environment node
/**
 * content:estimate (CONTENT_GUIDE §8.5) and its --replace path, which the
 * editors asked for: an active item takes a new estimate and stays active,
 * with its checks still valid, because `predicted` is in no checker packet.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { EstimateInputEntry } from "../../src/content/pipeline/estimates.ts";
import type { AnyItem } from "../../src/content/schema/items.ts";
import {
  CHECKER_A,
  EDITOR,
  REPO_ROOT,
  WRITER,
  fxFiles,
  fxRecord,
  itemOf,
  removeTempDirs,
  tempDir,
  writeTree,
} from "../../src/content/pipeline/__fixtures__/builders.ts";
import { loadBank, type Bank } from "../../src/content/pipeline/bank.ts";
import { decideOne } from "../../src/content/pipeline/decisions.ts";
import { resolveLayout } from "../../src/content/pipeline/layout.ts";
import { changedSinceChecks } from "../../src/content/pipeline/packets.ts";
import { mergeRecord } from "../../src/content/pipeline/records.ts";
import { requireBatch } from "../../src/content/pipeline/register.ts";
import { saveItems } from "../../src/content/pipeline/store.ts";
import { estimateBatch } from "./estimate.ts";
import { lintBank } from "./lint.ts";

afterAll(removeTempDirs);

const NOW = "2026-11-04T12:00:00Z";
const FIRST = {
  practice: { p: 0.7, spread: 0.3, estimator: "v0" },
  mystery: {
    solveByClue: [0.5, 0.8, 0.92, 0.98],
    spread: 0.3,
    estimator: "v0",
  },
};

const batchOf = (id: string) =>
  id.startsWith("fx.m.") ? "m.geo.b01" : "p.geo.b01";

/** A fixture tree whose items are checked by A and B and accepted. */
async function acceptedTree(
  ids: string[],
): Promise<{ root: string; bank: Bank }> {
  const root = await writeTree(fxFiles());
  const bank = await loadBank(
    resolveLayout({ repoRoot: REPO_ROOT, root, fixtures: true }),
  );
  for (const id of ids) {
    const record = itemOf(bank, id);
    let item: AnyItem = record.item;
    for (const pass of ["A", "B"] as const)
      item = mergeRecord(item, fxRecord(bank, record, pass), pass, false).item;
    item = {
      ...item,
      predicted: id.startsWith("fx.m.") ? FIRST.mystery : FIRST.practice,
      verification: {
        ...(item.verification ?? { checks: [] }),
        estimates: [{ by: "es-fx-first", at: "2026-11-02T09:00:00Z" }],
      },
      status: "checking",
    } as AnyItem;
    await saveItems(bank, new Map([[id, item]]));
    const decided = decideOne(
      bank,
      requireBatch(bank, batchOf(id)),
      itemOf(bank, id),
      {
        itemId: id,
        editor: EDITOR,
        decision: "accept",
        reason: "Both checks pass.",
        decidedAt: "2026-11-03T09:00:00Z",
      },
      { now: "2026-11-03T09:00:00Z" },
    );
    expect(decided.outcome.errors, id).toEqual([]);
    if (decided.item) await saveItems(bank, new Map([[id, decided.item]]));
    expect(itemOf(bank, id).item.status).toBe("active");
  }
  return { root, bank };
}

const practiceEstimate = (
  estimator = "es-fx-again",
  values = [0.4, 0.42, 0.38, 0.45, 0.4],
): EstimateInputEntry => ({
  itemId: "fx.p.geo.0101",
  estimator,
  estimates: values,
});

describe("content:estimate on active items", () => {
  it("refuses an active item without --replace, and writes nothing", async () => {
    const { bank } = await acceptedTree(["fx.p.geo.0101"]);
    const run = estimateBatch(
      bank,
      requireBatch(bank, "p.geo.b01"),
      [practiceEstimate()],
      { replace: false, now: NOW },
    );
    expect(run.updates.size).toBe(0);
    expect(run.failures).toEqual([
      {
        itemId: "fx.p.geo.0101",
        errors: [expect.stringContaining("pass --replace")],
      },
    ]);
  });

  it("with --replace, writes the new estimate, keeps the item active and its checks valid", async () => {
    const { bank } = await acceptedTree(["fx.p.geo.0101"]);
    const before = itemOf(bank, "fx.p.geo.0101").item;
    const run = estimateBatch(
      bank,
      requireBatch(bank, "p.geo.b01"),
      [practiceEstimate()],
      { replace: true, now: NOW },
    );
    expect(run.failures).toEqual([]);
    const after = run.updates.get("fx.p.geo.0101");
    expect(after?.status).toBe("active");
    expect(after?.predicted).toEqual({
      p: 0.4,
      spread: 0.109,
      estimator: "v0",
    });
    // Everything but the estimate and its trail is as it was.
    const { predicted: _p, verification: vAfter, ...restAfter } = after ?? {};
    const { predicted: _q, verification: vBefore, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
    expect(vAfter?.checks).toEqual(vBefore?.checks);
    expect(vAfter?.editor).toEqual(vBefore?.editor);
    expect(vAfter?.estimates).toEqual([
      { by: "es-fx-first", at: "2026-11-02T09:00:00Z" },
      { by: "es-fx-again", at: NOW },
    ]);
    expect(changedSinceChecks("fx.p.geo.0101", after as AnyItem)).toEqual([]);
    expect(run.changes).toEqual([
      expect.objectContaining({
        itemId: "fx.p.geo.0101",
        status: "active",
        bandBefore: "medium",
        bandAfter: "hard",
      }),
    ]);
    // On disk, the item still passes the acceptance rule content:check applies.
    await saveItems(bank, run.updates);
    const reloaded = await loadBank(bank.layout);
    const findings = lintBank(reloaded, { today: "2026-11-04" }).filter(
      (finding) =>
        finding.itemId === "fx.p.geo.0101" && finding.severity === "error",
    );
    expect(findings).toEqual([]);
  });

  it("refuses a run that wrote, checked or decided the item", async () => {
    const { bank } = await acceptedTree(["fx.p.geo.0101"]);
    for (const estimator of [
      `es-${CHECKER_A.slice(3)}`,
      `es-${EDITOR.slice(3)}`,
      `es-${WRITER.slice(2)}`,
    ]) {
      const run = estimateBatch(
        bank,
        requireBatch(bank, "p.geo.b01"),
        [practiceEstimate(estimator)],
        { replace: true, now: NOW },
      );
      expect(run.updates.size, estimator).toBe(0);
      expect(run.failures[0]?.errors.join(" "), estimator).toMatch(
        /one run holds one role|wrote this batch|checked this item|editor/,
      );
    }
  });

  it("names a mystery whose new expected points leave its slot's window", async () => {
    const { bank } = await acceptedTree(["fx.m.geo.0101"]);
    const hard: [number, number, number, number] = [0.15, 0.4, 0.62, 0.86];
    const run = estimateBatch(
      bank,
      requireBatch(bank, "m.geo.b01"),
      [
        {
          itemId: "fx.m.geo.0101",
          estimator: "es-fx-again",
          estimates: [hard, hard, hard, hard, hard],
        },
      ],
      { replace: true, now: NOW },
    );
    expect(run.failures).toEqual([]);
    expect(run.changes[0]?.window).toEqual({
      slot: 1,
      expected: 2.03,
      low: 3.2,
      high: 3.6,
      fits: 3,
    });
  });

  it("never re-estimates a cut item, even with --replace", async () => {
    const { bank } = await acceptedTree([]);
    const record = itemOf(bank, "fx.p.geo.0101");
    await saveItems(
      bank,
      new Map([
        ["fx.p.geo.0101", { ...record.item, status: "cut" } as AnyItem],
      ]),
    );
    const run = estimateBatch(
      bank,
      requireBatch(bank, "p.geo.b01"),
      [practiceEstimate()],
      { replace: true, now: NOW },
    );
    expect(run.failures[0]?.errors.join(" ")).toContain("the item is cut");
  });
});

describe("the content:estimate command", () => {
  function cli(root: string, ...args: string[]) {
    const run = spawnSync(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        join(REPO_ROOT, "scripts/content/estimate.ts"),
        "--root",
        root,
        "--fixtures",
        ...args,
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    return { code: run.status, out: `${run.stdout}${run.stderr}` };
  }

  it("re-estimates an active practice item with --replace and reminds the editor to rebuild the packs", async () => {
    const { root } = await acceptedTree(["fx.p.geo.0101"]);
    const file = join(tempDir("qz-estimate-"), "estimates.json");
    writeFileSync(file, JSON.stringify([practiceEstimate()]));
    const refused = cli(root, "--batch", "p.geo.b01", "--file", file);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("pass --replace");
    expect(refused.out).toContain("nothing was written");

    const replaced = cli(
      root,
      "--batch",
      "p.geo.b01",
      "--file",
      file,
      "--replace",
    );
    expect(replaced.code).toBe(0);
    expect(replaced.out).toContain(
      "fx.p.geo.0101 (active): band medium -> hard",
    );
    expect(replaced.out).toContain("wrote predicted on 1 item(s)");
    expect(replaced.out).toContain("run npm run content:build");
    const saved = JSON.parse(
      readFileSync(join(root, "practice/geography/fx.p.geo.0101.json"), "utf8"),
    ) as AnyItem;
    expect(saved.status).toBe("active");
    expect(saved.predicted).toEqual({ p: 0.4, spread: 0.109, estimator: "v0" });
  }, 30_000);
});
