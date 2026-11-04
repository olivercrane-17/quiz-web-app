// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { AnyItem } from "../schema/items.ts";
import type { Pass } from "../schema/verification.ts";
import {
  CHECKER_A,
  CHECKER_B,
  CHECKER_T,
  EDITOR,
  REPO_ROOT,
  fxFiles,
  fxRecord,
  fxRegister,
  itemOf,
  loadFx,
  removeTempDirs,
  tempDir,
} from "./__fixtures__/builders.ts";
import { loadBank, type Bank } from "./bank.ts";
import { decideOne } from "./decisions.ts";
import { recordsBy, voidBatchChecks, voidCheckerRecords } from "./incidents.ts";
import { cloneJson, formatJson } from "./json.ts";
import { resolveLayout } from "./layout.ts";
import { lintBank } from "./lint/index.ts";
import { checkRecord, mergeRecord } from "./records.ts";
import { requireBatch } from "./register.ts";
import { assertPacketsIgnored, saveItems } from "./store.ts";

afterAll(removeTempDirs);

const PREDICTED = { p: 0.6, spread: 0.3, estimator: "v0" };
const DECIDED_AT = "2026-11-03T09:00:00Z";
const FRESH = "fc-fx-fresh";

interface Prepared {
  /** Passes recorded with fxRecord (A alpha, B bravo, T tango); default A and B. */
  passes?: Pass[];
  /** Carries the estimator's predicted (default true). */
  estimate?: boolean;
  /** The editor's decision, applied as content:decide applies it. */
  decision?: "accept" | "cut";
}

/** A fixture bank whose p.geo.b01 items are checked, estimated and decided as given. */
async function preparedBank(
  items: Record<string, Prepared>,
  status = "checking",
): Promise<Bank> {
  const bank = await loadFx(
    fxFiles({ "batches.json": fxRegister({ status }) }),
  );
  const checked = new Map<string, AnyItem>();
  for (const [id, spec] of Object.entries(items)) {
    const record = itemOf(bank, id);
    let item: AnyItem =
      spec.estimate === false
        ? record.item
        : ({ ...record.item, predicted: PREDICTED } as AnyItem);
    for (const pass of spec.passes ?? ["A", "B"])
      item = mergeRecord(item, fxRecord(bank, record, pass), pass, false).item;
    checked.set(id, item);
  }
  await saveItems(bank, checked);
  const decided = new Map<string, AnyItem>();
  for (const [id, spec] of Object.entries(items)) {
    if (!spec.decision) continue;
    const { outcome, item } = decideOne(
      bank,
      requireBatch(bank, "p.geo.b01"),
      itemOf(bank, id),
      {
        itemId: id,
        editor: EDITOR,
        decision: spec.decision,
        reason: "Decided on both checks.",
        decidedAt: DECIDED_AT,
      },
      { now: DECIDED_AT },
    );
    expect(outcome.errors, id).toEqual([]);
    if (item) decided.set(id, item);
  }
  await saveItems(bank, decided);
  return bank;
}

/** The item as voiding `checker` should leave it: those records gone, nothing else touched. */
function withoutRecordsBy(
  item: AnyItem,
  checker: string,
  status: AnyItem["status"],
): AnyItem {
  const next = cloneJson(item);
  next.status = status;
  const v = next.verification;
  if (v) {
    v.checks = v.checks.filter((check) => check.checker !== checker);
    if (v.tiebreak?.checker === checker) v.tiebreak = null;
    if (item.status === "active") delete v.editor;
  }
  return next;
}

const errorsOf = (bank: Bank) =>
  lintBank(bank, { today: "2026-11-04" }).filter(
    (finding) => finding.severity === "error",
  );

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

describe("an invalid_check incident: one checker's records voided", () => {
  it("reopens an active item to checking with the other pass and the estimate intact and the accept gone", async () => {
    const prepared = await preparedBank({
      "fx.p.geo.0101": { decision: "accept" },
    });
    // Loaded as content:batch loads it: the loader's copy has the schema's
    // key order, which is not the file's.
    const bank = await loadBank(prepared.layout);
    const file = itemOf(bank, "fx.p.geo.0101").file.abs;
    const onDisk = JSON.parse(readFileSync(file, "utf8")) as AnyItem;
    const before = itemOf(bank, "fx.p.geo.0101").item;
    expect(Object.keys(before.verification ?? {})).not.toEqual(
      Object.keys(onDisk.verification ?? {}),
    );
    const snapshot = JSON.stringify(before);
    expect(before.status).toBe("active");
    expect(before.verification?.editor?.decision).toBe("accept");

    // Run ids are compared (sameAgentRun), so case does not matter.
    const voided = voidCheckerRecords(bank, "p.geo.b01", "fc-FX-Bravo");
    expect(voided.reopened).toEqual(["fx.p.geo.0101"]);
    expect(voided.voided).toBe(1);
    expect([...voided.updates.keys()]).toEqual(["fx.p.geo.0101"]);
    const item = voided.updates.get("fx.p.geo.0101");
    expect(item?.status).toBe("checking");
    expect(item?.verification?.checks.map((c) => [c.pass, c.checker])).toEqual([
      ["A", CHECKER_A],
    ]);
    expect(item?.verification?.checks[0]).toEqual(
      before.verification?.checks[0],
    );
    expect(item && "predicted" in item ? item.predicted : null).toEqual(
      PREDICTED,
    );
    expect(item?.verification).not.toHaveProperty("editor");
    // Everything else stays exactly as the file has it, key order included:
    // the estimate history, dedupe, myths screen and lint records.
    const expected = withoutRecordsBy(onDisk, CHECKER_B, "checking");
    expect(JSON.stringify(item)).toBe(JSON.stringify(expected));
    // Planning changes nothing in the bank.
    expect(JSON.stringify(itemOf(bank, "fx.p.geo.0101").item)).toBe(snapshot);

    // Saved, the file differs only where the voiding changed it, and
    // content:check accepts the reopened item.
    await saveItems(bank, voided.updates);
    expect(readFileSync(file, "utf8")).toBe(await formatJson(expected));
    expect(errorsOf(await loadBank(bank.layout))).toEqual([]);
  });

  it("edits the bank's copy of an item changed in memory since it was read", async () => {
    const bank = await preparedBank({
      "fx.p.geo.0101": { decision: "accept" },
    });
    const record = itemOf(bank, "fx.p.geo.0101");
    record.item = {
      ...record.item,
      tags: ["fixtures", "festivals"],
    } as AnyItem;
    const voided = voidCheckerRecords(bank, "p.geo.b01", CHECKER_B);
    expect(voided.updates.get(record.id)?.tags).toEqual([
      "fixtures",
      "festivals",
    ]);
  });

  it("sends a checking item that loses its only check to draft, and keeps a draft a draft", async () => {
    const bank = await preparedBank({
      "fx.p.geo.0101": { passes: ["B"] },
      "fx.p.geo.0102": {},
      "fx.p.geo.0103": { passes: ["B"], estimate: false },
    });
    // Another batch's record by the same checker is not this incident's.
    const mystery = itemOf(bank, "fx.m.geo.0101");
    await saveItems(
      bank,
      new Map([
        [
          mystery.id,
          mergeRecord(mystery.item, fxRecord(bank, mystery, "B"), "B", false)
            .item,
        ],
      ]),
    );
    const before = (id: string) => itemOf(bank, id).item;
    expect(before("fx.p.geo.0101").status).toBe("checking");
    expect(before("fx.p.geo.0103").status).toBe("draft");

    const voided = voidCheckerRecords(bank, "p.geo.b01", CHECKER_B);
    expect(voided.reopened).toEqual([]);
    expect(voided.voided).toBe(3);
    expect([...voided.updates.keys()]).toEqual([
      "fx.p.geo.0101",
      "fx.p.geo.0102",
      "fx.p.geo.0103",
    ]);
    const after = (id: string) => voided.updates.get(id);
    // Its only check is gone: back to draft, still carrying its estimate.
    expect(after("fx.p.geo.0101")).toEqual(
      withoutRecordsBy(before("fx.p.geo.0101"), CHECKER_B, "draft"),
    );
    expect(after("fx.p.geo.0101")?.verification?.checks).toEqual([]);
    // Pass A remains, so it stays checking.
    expect(after("fx.p.geo.0102")).toEqual(
      withoutRecordsBy(before("fx.p.geo.0102"), CHECKER_B, "checking"),
    );
    expect(after("fx.p.geo.0103")).toEqual(
      withoutRecordsBy(before("fx.p.geo.0103"), CHECKER_B, "draft"),
    );
    await saveItems(bank, voided.updates);
    expect(errorsOf(await loadBank(bank.layout))).toEqual([]);
  });

  it("voids a tiebreak to null and keeps passes A and B", async () => {
    const bank = await preparedBank({
      "fx.p.geo.0101": { passes: ["A", "B", "T"] },
    });
    const before = itemOf(bank, "fx.p.geo.0101").item;
    const voided = voidCheckerRecords(bank, "p.geo.b01", CHECKER_T);
    expect(voided.voided).toBe(1);
    const item = voided.updates.get("fx.p.geo.0101");
    expect(item?.verification?.tiebreak).toBeNull();
    expect(item?.verification?.checks).toEqual(before.verification?.checks);
    expect(item?.status).toBe("checking");
  });

  it("leaves cut and retired items untouched", async () => {
    const bank = await preparedBank({
      "fx.p.geo.0101": { decision: "cut" },
      "fx.p.geo.0103": { decision: "accept" },
    });
    const retired = {
      ...itemOf(bank, "fx.p.geo.0103").item,
      status: "retired",
    } as AnyItem;
    await saveItems(bank, new Map([["fx.p.geo.0103", retired]]));
    const files = ["fx.p.geo.0101", "fx.p.geo.0103"].map(
      (id) => itemOf(bank, id).file.abs,
    );
    const onDisk = files.map((file) => readFileSync(file, "utf8"));

    const voided = voidCheckerRecords(bank, "p.geo.b01", CHECKER_B);
    expect(voided).toEqual({ updates: new Map(), reopened: [], voided: 0 });
    // Their history stays: the checker's records are still there.
    expect(
      recordsBy(itemOf(bank, "fx.p.geo.0101").item, CHECKER_B),
    ).toHaveLength(1);
    expect(files.map((file) => readFileSync(file, "utf8"))).toEqual(onDisk);
  });

  it("bars the checker afterwards, but takes the pass from a new checker id and lets the editor accept again", async () => {
    const bank = await preparedBank({
      "fx.p.geo.0101": { decision: "accept" },
    });
    const voided = voidCheckerRecords(bank, "p.geo.b01", CHECKER_B);
    await saveItems(bank, voided.updates);
    const batch = requireBatch(bank, "p.geo.b01");
    batch.incidents.push({
      date: "2026-11-04",
      kind: "invalid_check",
      note: "Pass B records were templated.",
      checkers: [CHECKER_B],
    });
    const record = itemOf(bank, "fx.p.geo.0101");
    for (const checker of [CHECKER_B, CHECKER_B.toUpperCase()]) {
      expect(
        checkRecord(
          bank,
          batch,
          "B",
          record,
          fxRecord(bank, record, "B", { checker }),
        ).errors,
        checker,
      ).toEqual([
        expect.stringContaining(
          "barred from this batch by its invalid_check incident of 2026-11-04",
        ),
      ]);
    }
    const fresh = fxRecord(bank, record, "B", { checker: FRESH });
    expect(checkRecord(bank, batch, "B", record, fresh).errors).toEqual([]);

    const merged = mergeRecord(record.item, fresh, "B", false).item;
    expect(merged.status).toBe("checking");
    expect(merged.verification?.checks.map((c) => c.checker)).toEqual([
      CHECKER_A,
      FRESH,
    ]);
    await saveItems(bank, new Map([[record.id, merged]]));
    const { outcome, item } = decideOne(
      bank,
      batch,
      itemOf(bank, record.id),
      {
        itemId: record.id,
        editor: EDITOR,
        decision: "accept",
        reason: "Both checks pass, pass B redone by a new checker.",
        decidedAt: "2026-11-05T09:00:00Z",
      },
      { now: "2026-11-05T09:00:00Z" },
    );
    expect(outcome.errors).toEqual([]);
    expect(item?.status).toBe("active");
  });
});

describe("content:batch -- incident --kind invalid_check", () => {
  const cli = (root: string, script: string, ...args: string[]) => {
    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        join(REPO_ROOT, "scripts/content", `${script}.ts`),
        ...args,
        "--root",
        root,
        "--fixtures",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        // Never the machine's own key file: HOME is the throwaway tree.
        env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: root },
      },
    );
    return { code: result.status, out: result.stdout, err: result.stderr };
  };
  const incident = (root: string, ...args: string[]) =>
    cli(
      root,
      "batch",
      "incident",
      "--batch",
      "p.geo.b01",
      "--note",
      "Pass B records were templated.",
      ...args,
    );
  const invalidCheck = (root: string, checker?: string) =>
    incident(
      root,
      "--kind",
      "invalid_check",
      ...(checker === undefined ? [] : ["--checker", checker]),
    );

  it(
    "records the incident, reopens a closed batch and prints what to do next",
    { timeout: 60_000 },
    async () => {
      // A closed batch: one item accepted and two cut, all checked by A and B.
      const bank = await preparedBank({
        "fx.p.geo.0101": { decision: "accept" },
        "fx.p.geo.0102": { decision: "cut" },
        "fx.p.geo.0103": { decision: "cut" },
      });
      const root = bank.layout.root;
      expect(cli(root, "batch", "close", "--batch", "p.geo.b01").out).toContain(
        "closed: 1 accepted (target 10), 2 cut",
      );
      const file = (id: string) => itemOf(bank, id).file.abs;
      const accepted = JSON.parse(
        readFileSync(file("fx.p.geo.0101"), "utf8"),
      ) as AnyItem;
      const cut = readFileSync(file("fx.p.geo.0103"), "utf8");

      const run = invalidCheck(root, CHECKER_B);
      expect(run.code, run.err).toBe(0);
      for (const line of [
        "p.geo.b01: invalid_check incident recorded; fc-fx-bravo may not check this batch again.",
        "Voided 1 record(s) by fc-fx-bravo on 1 item(s):",
        "  pass B: fx.p.geo.0101",
        "Reopened 1 active item(s), whose accept no longer stands: fx.p.geo.0101.",
        "2 cut or retired item(s) keep fc-fx-bravo's records as history.",
        "p.geo.b01 was closed and is checking again; accepted and cut keep their counts until the next close.",
        "npm run content:packet -- --batch p.geo.b01 --pass B --items fx.p.geo.0101",
        "under a NEW checker id (content:record refuses fc-fx-bravo for this batch)",
        "npm run content:record -- --batch p.geo.b01 --pass B --file <records.json>",
        "the editor decides the reopened items and closes the batch",
        "npm run content:decide -- --batch p.geo.b01 --file <decisions.json>",
        "npm run content:batch -- close --batch p.geo.b01",
      ])
        expect(run.out).toContain(line);
      // A fixture tree has no envelopes to re-seal.
      expect(run.out).not.toContain("content:seal");

      // The register first: the incident, and the batch checking again with
      // the last close's counts.
      const reloaded = await loadBank(bank.layout);
      expect(requireBatch(reloaded, "p.geo.b01")).toMatchObject({
        status: "checking",
        accepted: 1,
        cut: 2,
        incidents: [
          {
            date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            kind: "invalid_check",
            note: "Pass B records were templated.",
            checkers: [CHECKER_B],
          },
        ],
      });
      // The reopened item differs only where it must; the cut one not at all.
      expect(readFileSync(file("fx.p.geo.0101"), "utf8")).toBe(
        await formatJson(withoutRecordsBy(accepted, CHECKER_B, "checking")),
      );
      expect(readFileSync(file("fx.p.geo.0103"), "utf8")).toBe(cut);
      // content:check accepts the reopened batch and item.
      const checked = cli(root, "check", "--json");
      expect(checked.code, checked.out).toBe(0);
      expect(JSON.parse(checked.out)).toMatchObject({ ok: true, errors: 0 });

      // Running it again is safe: nothing is left to void, and no second
      // incident is recorded.
      const again = invalidCheck(root, CHECKER_B);
      expect(again.code, again.err).toBe(0);
      expect(again.out).toContain(
        "fc-fx-bravo is already barred by an invalid_check incident",
      );
      expect(again.out).toContain("No record by fc-fx-bravo left to void.");
      expect(
        requireBatch(await loadBank(bank.layout), "p.geo.b01").incidents,
      ).toHaveLength(1);

      // The way back: the barred checker is refused, a new checker id
      // records pass B, the editor accepts again and the batch closes.
      const recordFile = (name: string, checker: string) => {
        const path = join(root, name);
        const record = itemOf(reloaded, "fx.p.geo.0101");
        writeFileSync(
          path,
          JSON.stringify([fxRecord(reloaded, record, "B", { checker })]),
        );
        return path;
      };
      const refused = cli(
        root,
        "record",
        "--batch",
        "p.geo.b01",
        "--pass",
        "B",
        "--file",
        recordFile("barred.json", CHECKER_B),
      );
      expect(refused.code).toBe(1);
      expect(refused.out).toContain("invalid_check incident of");
      expect(refused.out).toContain("nothing was merged");
      const recorded = cli(
        root,
        "record",
        "--batch",
        "p.geo.b01",
        "--pass",
        "B",
        "--file",
        recordFile("fresh.json", FRESH),
      );
      expect(recorded.out).toContain("merged 1 pass B record(s)");
      const decisions = join(root, "decisions.json");
      writeFileSync(
        decisions,
        JSON.stringify([
          {
            itemId: "fx.p.geo.0101",
            editor: EDITOR,
            decision: "accept",
            reason: "Both checks pass, pass B redone by a new checker.",
          },
        ]),
      );
      const decided = cli(
        root,
        "decide",
        "--batch",
        "p.geo.b01",
        "--file",
        decisions,
      );
      expect(decided.out).toContain("fx.p.geo.0101: accept -> active");
      expect(cli(root, "batch", "close", "--batch", "p.geo.b01").out).toContain(
        "closed: 1 accepted (target 10), 2 cut",
      );
      expect(cli(root, "check").code).toBe(0);
    },
  );

  it(
    "needs an fc- checker with records in the batch, and only with this kind",
    { timeout: 60_000 },
    async () => {
      const bank = await preparedBank({ "fx.p.geo.0101": {} });
      const root = bank.layout.root;
      const register = readFileSync(bank.layout.registerFile, "utf8");

      const missing = invalidCheck(root);
      expect(missing.code).toBe(2);
      expect(missing.err).toContain("--checker is required");
      const writer = invalidCheck(root, "w-fx-writer");
      expect(writer.code).toBe(1);
      expect(writer.err).toContain("fc-<run id>");
      // A typo must not bar a stranger or reopen anything.
      const stranger = invalidCheck(root, "fc-fx-nobody");
      expect(stranger.code).toBe(1);
      expect(stranger.err).toContain(
        "fc-fx-nobody has no A, B or T record on any item of p.geo.b01",
      );
      const other = incident(root, "--kind", "other", "--checker", CHECKER_B);
      expect(other.code).toBe(1);
      expect(other.err).toContain(
        "--checker goes with --kind invalid_check only",
      );
      const bogus = incident(root, "--kind", "invalid");
      expect(bogus.err).toContain(
        "--kind is fabricated_source, invalid_check, audit_failure or other",
      );
      expect(readFileSync(bank.layout.registerFile, "utf8")).toBe(register);
    },
  );
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
