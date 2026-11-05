// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { RecordInputEntry } from "../schema/inputs.ts";
import type { AnyItem, RoomQuestion } from "../schema/items.ts";
import {
  CHECKER_A,
  EDITOR,
  REPO_ROOT,
  fxComparison,
  fxFiles,
  fxMc,
  fxPack,
  fxRecord,
  fxRegister,
  fxRoomQuestion,
  itemOf,
  loadFx,
  removeTempDirs,
  type FxFiles,
} from "./__fixtures__/builders.ts";
import { loadBank, type Bank } from "./bank.ts";
import { lintBank } from "./lint/index.ts";
import { mergeRecord } from "./records.ts";
import { requireBatch } from "./register.ts";
import {
  REINSTATE_REASON,
  applyReinstatement,
  evidenceGaps,
  keptByReason,
  planReinstatement,
  type KeepReason,
} from "./reinstate.ts";
import { saveItems } from "./store.ts";

afterAll(removeTempDirs);

const NOW = "2026-11-05T10:00:00Z";
const CUT_AT = "2026-11-03T09:00:00Z";
const CUT_REASON =
  "Both checks pass, but the high-risk claims rest on knowledge only.";

const PREDICTED = {
  practice: { p: 0.7, spread: 0.3, estimator: "v0" },
  encore: { pClose: 0.3, pExact: 0.02, spread: 0.4, estimator: "v0" },
};

type Json = Record<string, unknown>;
type Patch = (pass: "A" | "B", entry: RecordInputEntry) => RecordInputEntry;

/** Every claim confirmed from certain knowledge: a check with no search budget. */
const knowledgeOnly: Patch = (_pass, entry) => ({
  ...entry,
  claimResults: entry.claimResults.map((result) => ({
    ...result,
    method: "knowledge" as const,
    evidence: {
      kind: "knowledge" as const,
      basis: "reference" as const,
      restatement: `Restated ${result.claimId}.`,
      confidence: "certain" as const,
    },
  })),
});

/** The fixture register with every batch closed, as content:batch -- close leaves it. */
function closedRegister(extra: (batch: Json) => Json = (batch) => batch): Json {
  const register = fxRegister({ status: "closed" }) as { batches: Json[] };
  return {
    batches: register.batches.map((batch) =>
      extra({ ...batch, accepted: 0, cut: 1 }),
    ),
  };
}

interface Cut {
  /** Record patch; knowledge-only by default. */
  patch?: Patch;
  /** Changes to the item after its checks were recorded. */
  after?: (item: AnyItem) => AnyItem;
  editor?: string;
}

/**
 * A closed-batch fixture bank where each listed item was checked by A and B,
 * estimated, and then cut by the editor.
 */
async function cutBank(
  cuts: Record<string, Cut>,
  files: FxFiles = fxFiles({ "batches.json": closedRegister() }),
): Promise<Bank> {
  const bank = await loadFx(files);
  const updates = new Map<string, AnyItem>();
  for (const [id, cut] of Object.entries(cuts)) {
    const record = itemOf(bank, id);
    let item: AnyItem = record.item;
    for (const pass of ["A", "B"] as const) {
      const entry = fxRecord(bank, record, pass);
      item = mergeRecord(
        item,
        (cut.patch ?? knowledgeOnly)(pass, entry),
        pass,
        false,
      ).item;
    }
    const pool = record.pool === "encore" ? "encore" : "practice";
    item = {
      ...item,
      predicted: PREDICTED[pool],
      status: "cut",
      verification: {
        ...item.verification,
        checks: item.verification?.checks ?? [],
        editor: {
          editor: cut.editor ?? EDITOR,
          decision: "cut",
          reason: CUT_REASON,
          decidedAt: CUT_AT,
        },
      },
    } as AnyItem;
    updates.set(id, cut.after ? cut.after(item) : item);
  }
  await saveItems(bank, updates);
  return bank;
}

const plan = (bank: Bank, batches = ["p.geo.b01"]) =>
  planReinstatement(
    bank,
    batches.map((id) => requireBatch(bank, id)),
    { now: NOW },
  );

const strip = (item: AnyItem) => {
  const { verification: _v, status: _s, ...rest } = item;
  return rest;
};

describe("content:reinstate (decisions memo §18)", () => {
  it("reinstates a cut that only lacked external evidence, and touches nothing else", async () => {
    const bank = await cutBank({ "fx.p.geo.0103": {} });
    const before = itemOf(bank, "fx.p.geo.0103").item;
    expect(evidenceGaps(before)).toEqual(["c1", "c2"]);
    const file = itemOf(bank, "fx.p.geo.0103").file.abs;
    const onDisk = readFileSync(file, "utf8");
    const register = readFileSync(bank.layout.registerFile, "utf8");

    const result = plan(bank);
    const [batch] = result.batches;
    expect(batch).toMatchObject({
      batchId: "p.geo.b01",
      sealed: false,
      editor: EDITOR,
      considered: 1,
      reinstated: ["fx.p.geo.0103"],
      kept: [],
      register: {
        before: { accepted: 0, cut: 1 },
        after: { accepted: 1, cut: 0 },
      },
    });
    const item = result.updates.get("fx.p.geo.0103");
    expect(item?.status).toBe("active");
    expect(item?.verification).toMatchObject({
      editor: {
        editor: EDITOR,
        decision: "accept",
        reason: `${REINSTATE_REASON} ${CUT_REASON}`,
        decidedAt: NOW,
      },
      dedupe: { verdict: "unique" },
      mythsScreen: { checkedAt: NOW, hits: [] },
      lint: { passed: true },
      tiebreak: null,
      rechecks: [],
    });
    // Ids, text and the checks are exactly what they were.
    expect(strip(item as AnyItem)).toEqual(strip(before));
    expect(item?.verification?.checks).toEqual(before.verification?.checks);
    expect(item?.verification?.estimates).toEqual(
      before.verification?.estimates,
    );
    // Planning writes nothing: that is what --dry-run prints.
    expect(readFileSync(file, "utf8")).toBe(onDisk);
    expect(readFileSync(bank.layout.registerFile, "utf8")).toBe(register);

    const written = await applyReinstatement(bank, result);
    expect(written).toHaveLength(1);
    const reloaded = await loadBank(bank.layout);
    expect(itemOf(reloaded, "fx.p.geo.0103").item.status).toBe("active");
    expect(requireBatch(reloaded, "p.geo.b01")).toMatchObject({
      status: "closed",
      accepted: 1,
      cut: 0,
    });
    // content:check re-applies the acceptance rule to the active item.
    const errors = lintBank(reloaded, { today: NOW.slice(0, 10) }).filter(
      (finding) =>
        finding.itemId === "fx.p.geo.0103" && finding.severity === "error",
    );
    expect(errors).toEqual([]);
    // A second run finds nothing more to do.
    expect(plan(reloaded).batches[0]).toMatchObject({
      considered: 0,
      reinstated: [],
    });
  });

  const issue = (type: "wording" | "ambiguity", severity: "fix" | "note") => ({
    type,
    severity,
    note: "Raised by the checker.",
  });
  const cases: [string, Cut, KeepReason][] = [
    [
      "a verdict other than pass",
      {
        patch: (pass, entry) => {
          const e = knowledgeOnly(pass, entry);
          return pass === "B"
            ? { ...e, issues: [issue("wording", "fix")], verdict: "revise" }
            : e;
        },
      },
      "verdict",
    ],
    [
      "A and B by one run",
      {
        patch: (pass, entry) => ({
          ...knowledgeOnly(pass, entry),
          checker: pass === "B" ? CHECKER_A.toUpperCase() : entry.checker,
        }),
      },
      "same-run",
    ],
    [
      "a note-level issue (a style or content concern)",
      {
        patch: (pass, entry) => {
          const e = knowledgeOnly(pass, entry);
          return pass === "A"
            ? { ...e, issues: [issue("ambiguity", "note")] }
            : e;
        },
      },
      "checker-issue",
    ],
    [
      "a claim only one check saw (a checker's addition)",
      {
        patch: (pass, entry) => {
          const e = knowledgeOnly(pass, entry);
          const extra = e.claimResults[0];
          return pass === "A" && extra
            ? {
                ...e,
                claimResults: [...e.claimResults, { ...extra, claimId: "x1" }],
              }
            : e;
        },
      },
      "checker-addition",
    ],
    [
      "external evidence on every high-risk claim (the cut was for something else)",
      { patch: (_pass, entry) => entry },
      "no-evidence-gap",
    ],
    [
      "a stored dedupe verdict of duplicate",
      {
        after: (item) =>
          ({
            ...item,
            verification: {
              ...item.verification,
              dedupe: {
                checkedAt: CUT_AT,
                nearestId: "fx.p.geo.0101",
                score: 0.9,
                verdict: "duplicate",
              },
            },
          }) as AnyItem,
      },
      "dedupe",
    ],
    [
      "a stored myth-screen hit without external evidence",
      {
        after: (item) =>
          ({
            ...item,
            verification: {
              ...item.verification,
              mythsScreen: {
                checkedAt: CUT_AT,
                hits: [{ claimId: "c1", mythId: "fx-myth", cleared: true }],
              },
            },
          }) as AnyItem,
      },
      "myths",
    ],
    [
      "an edit after the checks",
      {
        after: (item) =>
          ({ ...item, explanation: "Brindle Tower was rebuilt." }) as AnyItem,
      },
      "changed",
    ],
  ];
  for (const [what, cut, reason] of cases) {
    it(`keeps the cut for ${what}`, async () => {
      const bank = await cutBank({ "fx.p.geo.0103": cut });
      const [batch] = plan(bank).batches;
      expect(batch?.reinstated).toEqual([]);
      expect(batch?.kept).toEqual([
        { itemId: "fx.p.geo.0103", reasons: expect.arrayContaining([reason]) },
      ]);
      expect(keptByReason(batch?.kept ?? [])).toEqual({ [reason]: 1 });
    });
  }

  it("keeps the cut when a tiebreak was involved", async () => {
    const bank = await cutBank({ "fx.p.geo.0103": {} });
    const record = itemOf(bank, "fx.p.geo.0103");
    const withT = mergeRecord(
      record.item,
      fxRecord(bank, record, "T"),
      "T",
      false,
    ).item;
    await saveItems(bank, new Map([[record.id, withT]]));
    expect(plan(bank).batches[0]?.kept).toEqual([
      {
        itemId: "fx.p.geo.0103",
        reasons: expect.arrayContaining(["tiebreak"]) as unknown,
      },
    ]);
  });

  it("runs the lint as content:decide does: a warning needs the editor's lintAllow", async () => {
    const files = fxFiles({
      "batches.json": closedRegister(),
      "practice/geography/fx.p.geo.0101.json": fxMc({
        wrong: ["A brass horn from the hills", "Hand drum", "Reed pipe"],
      }),
    });
    const bank = await cutBank({ "fx.p.geo.0101": {} }, files);
    expect(evidenceGaps(itemOf(bank, "fx.p.geo.0101").item)).not.toEqual([]);
    expect(plan(bank).batches[0]?.kept).toEqual([
      { itemId: "fx.p.geo.0101", reasons: ["lint"] },
    ]);
  });

  it("brings back only one of two near-duplicate cuts", async () => {
    const files = fxFiles({
      "batches.json": closedRegister(),
      "practice/geography/fx.p.geo.0104.json": fxComparison({
        id: "fx.p.geo.0104",
      }),
    });
    const bank = await cutBank(
      { "fx.p.geo.0103": {}, "fx.p.geo.0104": {} },
      files,
    );
    const [batch] = plan(bank).batches;
    expect(batch?.reinstated).toEqual(["fx.p.geo.0103"]);
    expect(batch?.kept).toEqual([
      { itemId: "fx.p.geo.0104", reasons: ["dedupe"] },
    ]);
  });

  it("needs the batch's one editor, and no incident against its checks", async () => {
    const two = await cutBank({
      "fx.p.geo.0101": {},
      "fx.p.geo.0103": { editor: "ed-fx-other" },
    });
    const [batch] = plan(two).batches;
    expect(batch?.editor).toBeNull();
    expect(batch?.reinstated).toEqual([]);
    expect(keptByReason(batch?.kept ?? [])).toEqual({ editor: 2 });

    const barred = await cutBank(
      { "fx.p.geo.0103": {} },
      fxFiles({
        "batches.json": closedRegister((entry) =>
          entry.batchId === "p.geo.b01"
            ? {
                ...entry,
                incidents: [
                  {
                    date: "2026-11-04",
                    kind: "fabricated_source",
                    note: "A cited page nobody retrieved.",
                    checkers: [CHECKER_A],
                  },
                ],
              }
            : entry,
        ),
      }),
    );
    expect(plan(barred).batches[0]?.kept).toEqual([
      { itemId: "fx.p.geo.0103", reasons: ["incident"] },
    ]);
  });

  it("never reinstates a cut on the records of a checker an invalid_check incident voided", async () => {
    // The incident leaves cut items' records in place as history, so the
    // incident gate is what keeps them from counting.
    const barred = await cutBank(
      { "fx.p.geo.0103": {} },
      fxFiles({
        "batches.json": closedRegister((entry) =>
          entry.batchId === "p.geo.b01"
            ? {
                ...entry,
                incidents: [
                  {
                    date: "2026-11-04",
                    kind: "invalid_check",
                    note: "Pass A records were templated.",
                    checkers: [CHECKER_A],
                  },
                ],
              }
            : entry,
        ),
      }),
    );
    expect(plan(barred).batches[0]?.kept).toEqual([
      { itemId: "fx.p.geo.0103", reasons: ["incident"] },
    ]);
  });

  it("considers closed item batches only", async () => {
    const open = await cutBank(
      { "fx.p.geo.0103": {} },
      fxFiles({ "batches.json": fxRegister({ status: "checking" }) }),
    );
    expect(() => plan(open)).toThrow(/closed item batches only/);
  });

  it("reinstates a sealed encore and reports it as sealed", async () => {
    const bank = await cutBank({ "fx.e.0101": {} });
    const [batch] = plan(bank, ["e.b01"]).batches;
    expect(batch).toMatchObject({
      batchId: "e.b01",
      sealed: true,
      reinstated: ["fx.e.0101"],
    });
  });

  it("never pushes a closed room pack past 15 questions in play (X04)", async () => {
    const extra = fxRoomQuestion(16, {
      stem: "In fixture Cindral, which name does the old salt mill carry?",
      claims: [
        {
          id: "c1",
          role: "key",
          risk: "high",
          riskReason: "number",
          text: "The Cindral salt mill is named Pewter.",
        },
        {
          id: "c2",
          role: "distractor",
          risk: "standard",
          text: "The salt mill has none of the other three names.",
        },
        {
          id: "c3",
          role: "explanation",
          risk: "standard",
          text: "Residents voted on the name.",
        },
      ],
    } as Partial<RoomQuestion> & Json);
    const pack = (inPlay: number) =>
      fxFiles({
        "batches.json": closedRegister(),
        "room-packs/fx-party.json": fxPack([
          ...Array.from({ length: inPlay }, (_, i) => fxRoomQuestion(i + 1)),
          extra,
        ]),
      });
    const full = await cutBank({ "fx.r.fx-party.16": {} }, pack(15));
    expect(plan(full, ["r.fx-party.b01"]).batches[0]?.kept).toEqual([
      { itemId: "fx.r.fx-party.16", reasons: ["pool"] },
    ]);
    // The guard only refuses what adds an error: a pack one short takes it.
    const short = await cutBank({ "fx.r.fx-party.16": {} }, pack(14));
    expect(plan(short, ["r.fx-party.b01"]).batches[0]?.reinstated).toEqual([
      "fx.r.fx-party.16",
    ]);
  });

  // Spawns the CLI twice; under shared-CPU load each run takes several seconds.
  it(
    "prints counts and ids, and for a sealed batch counts only",
    { timeout: 30_000 },
    async () => {
      const bank = await cutBank({ "fx.p.geo.0103": {}, "fx.e.0101": {} });
      const root = bank.layout.root;
      const run = (...args: string[]) =>
        spawnSync(
          process.execPath,
          [
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            join(REPO_ROOT, "scripts/content/reinstate.ts"),
            "--root",
            root,
            "--fixtures",
            ...args,
          ],
          {
            cwd: REPO_ROOT,
            encoding: "utf8",
            env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: root },
          },
        );
      const text = run("--all", "--dry-run");
      expect(text.status, text.stderr).toBe(0);
      expect(text.stdout).toContain("dry run, nothing is written");
      expect(text.stdout).toContain("fx.p.geo.0103");
      expect(text.stdout).toMatch(/e\.b01 .*would reinstate 1/);
      expect(text.stdout).toContain("ids: not shown for a sealed batch");
      const json = run("--all", "--dry-run", "--json");
      const report = JSON.parse(json.stdout) as {
        dryRun: boolean;
        batches: { batchId: string; reinstated: number; ids?: string[] }[];
      };
      expect(report.dryRun).toBe(true);
      expect(report.batches.find((b) => b.batchId === "e.b01")).toMatchObject({
        reinstated: 1,
      });
      expect(
        report.batches.find((b) => b.batchId === "e.b01"),
      ).not.toHaveProperty("ids");
      for (const output of [text.stdout, json.stdout]) {
        expect(output).not.toContain("fx.e.0101");
        expect(output).not.toContain("Gorlund");
        expect(output).not.toContain("Brindle");
        expect(output).not.toContain(CUT_REASON);
      }
      // The dry run wrote nothing.
      expect(itemOf(await loadBank(bank.layout), "fx.e.0101").item.status).toBe(
        "cut",
      );
      expect(run("--batch", "p.geo.b01", "--all").status).toBe(2);
      expect(run().status).toBe(2);
    },
  );
});
