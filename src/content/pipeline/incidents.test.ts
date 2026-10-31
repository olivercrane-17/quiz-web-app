// @vitest-environment node
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { AnyItem } from "../schema/items.ts";
import {
  CHECKER_A,
  CHECKER_B,
  fxRecord,
  itemOf,
  loadFx,
  removeTempDirs,
  tempDir,
} from "./__fixtures__/builders.ts";
import { voidBatchChecks } from "./incidents.ts";
import { resolveLayout } from "./layout.ts";
import { checkRecord, mergeRecord } from "./records.ts";
import { requireBatch } from "./register.ts";
import { assertPacketsIgnored, saveItems } from "./store.ts";

afterAll(removeTempDirs);

describe("a fabricated-source incident (§9.6)", () => {
  it("voids every non-active item's checks and bars the batch's checkers", async () => {
    const bank = await loadFx();
    const updates = new Map<string, AnyItem>();
    for (const id of ["fx.p.geo.0101", "fx.p.geo.0103"]) {
      const record = itemOf(bank, id);
      let item: AnyItem = {
        ...record.item,
        predicted: { p: 0.6, spread: 0.3, estimator: "v0" },
      } as AnyItem;
      for (const pass of ["A", "B"] as const)
        item = mergeRecord(
          item,
          fxRecord(bank, record, pass),
          pass,
          false,
        ).item;
      updates.set(id, item);
    }
    await saveItems(bank, updates);
    expect(itemOf(bank, "fx.p.geo.0101").item.status).toBe("checking");

    const voided = voidBatchChecks(bank, "p.geo.b01");
    expect([...voided.updates.keys()].sort()).toEqual([
      "fx.p.geo.0101",
      "fx.p.geo.0103",
    ]);
    expect(voided.checkers).toEqual([CHECKER_A, CHECKER_B].sort());
    const item = voided.updates.get("fx.p.geo.0101");
    expect(item?.verification?.checks).toEqual([]);
    expect(item?.status).toBe("draft");
    // The item did not change, so its estimate stands.
    expect(item && "predicted" in item ? item.predicted : null).toMatchObject({
      p: 0.6,
    });

    await saveItems(bank, voided.updates);
    const batch = requireBatch(bank, "p.geo.b01");
    batch.incidents.push({
      date: "2026-11-02",
      kind: "fabricated_source",
      note: "c3 cited a page nobody retrieved",
      checkers: voided.checkers,
    });
    const record = itemOf(bank, "fx.p.geo.0101");
    const stale = fxRecord(bank, record, "A");
    expect(checkRecord(bank, batch, "A", record, stale).errors).toEqual([
      expect.stringContaining("fabricated-source incident"),
    ]);
    const fresh = fxRecord(bank, record, "A", { checker: "fc-fx-fresh" });
    expect(checkRecord(bank, batch, "A", record, fresh).errors).toEqual([]);
  });
});

describe("content:packet's guard", () => {
  it("refuses to write sealed packets unless .cache/packets/ is git-ignored", () => {
    const repo = tempDir("qz-packets-");
    spawnSync("git", ["init", "-q"], { cwd: repo });
    const layout = resolveLayout({
      repoRoot: repo,
      root: join(repo, "content"),
    });
    expect(() => assertPacketsIgnored(layout)).toThrow(/not git-ignored/);
    writeFileSync(join(repo, ".gitignore"), ".cache/\n");
    expect(() => assertPacketsIgnored(layout)).not.toThrow();
  });
});
