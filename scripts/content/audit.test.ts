// @vitest-environment node
/**
 * The seeded blind audit (CONTENT_GUIDE §9.10) and the record PRD AC-CNT-05
 * reads: the draw is seeded, the auditor's packet hides which items are
 * planted, the verdicts and re-checks fill the record, and `auditCriteria`
 * decides AC-CNT-05 from its counts. The dry run drives the real command.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  loadBank,
  type Bank,
  type BankItem,
} from "../../src/content/pipeline/bank.ts";
import { decideOne } from "../../src/content/pipeline/decisions.ts";
import { resolveLayout } from "../../src/content/pipeline/layout.ts";
import { mergeRecord } from "../../src/content/pipeline/records.ts";
import { requireBatch } from "../../src/content/pipeline/register.ts";
import { saveItems } from "../../src/content/pipeline/store.ts";
import {
  EDITOR,
  REPO_ROOT,
  fxEncore,
  fxFiles,
  fxMc,
  fxMystery,
  fxRecord,
  itemOf,
  removeTempDirs,
  tempDir,
  writeTree,
} from "../../src/content/pipeline/__fixtures__/builders.ts";
import {
  AuditRecordSchema,
  SUBTLE_DEFECTS,
  auditCriteria,
  countsOf,
  type AuditRecord,
} from "../../src/content/schema/audit.ts";
import type { AnyItem } from "../../src/content/schema/items.ts";
import {
  applyVerdicts,
  auditFindings,
  drawAudit,
  packAudit,
  plantProblems,
  settleFlagged,
  type PlantFile,
} from "./audit.ts";

afterAll(removeTempDirs);

const AUDITOR = { id: "au-fx-auditor", model: "model-b" };

const PREDICTED: Record<string, unknown> = {
  p: { p: 0.7, spread: 0.3, estimator: "v0" },
  m: { solveByClue: [0.5, 0.8, 0.92, 0.98], spread: 0.3, estimator: "v0" },
  e: { pClose: 0.3, pExact: 0.02, spread: 0.4, estimator: "v0" },
};

/** A fixture tree whose items were checked by A and B, estimated and accepted. */
async function acceptedTree(dir: string, accept: string[]): Promise<string> {
  const root = await writeTree(fxFiles(), dir);
  const bank = await loadBank(
    resolveLayout({ repoRoot: REPO_ROOT, root, fixtures: true }),
  );
  for (const id of accept) {
    const kind = id.split(".")[1] ?? "p";
    const record = itemOf(bank, id);
    let item: AnyItem = record.item;
    for (const pass of ["A", "B"] as const)
      item = mergeRecord(item, fxRecord(bank, record, pass), pass, false).item;
    item = {
      ...item,
      predicted: PREDICTED[kind],
      status: "checking",
    } as AnyItem;
    await saveItems(bank, new Map([[id, item]]));
    const batchId =
      kind === "m" ? "m.geo.b01" : kind === "e" ? "e.b01" : "p.geo.b01";
    const decided = decideOne(
      bank,
      requireBatch(bank, batchId),
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
  }
  return root;
}
const PLANTER = { id: "pl-fx-planter", model: "model-c" };

/** Deterministic packet ids for tests. */
function ids(prefix = "a"): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `pk-${prefix}${String(n).padStart(7, "0")}`;
  };
}

function record(item: AnyItem, pool: BankItem["pool"]): BankItem {
  return {
    id: item.id,
    pool,
    item,
    file: { sealed: pool !== "practice" } as BankItem["file"],
  };
}

/** A bank of active items: `practice` practice items and `daily` mysteries and encores. */
function activeBank(practice: number, daily: number): Bank {
  const items: BankItem[] = [];
  for (let i = 0; i < practice; i += 1) {
    const id = `fx.p.geo.${String(1000 + i).padStart(4, "0")}`;
    items.push(
      record({ ...fxMc({ id }), status: "active" } as AnyItem, "practice"),
    );
  }
  for (let i = 0; i < daily; i += 1) {
    const n = String(1000 + i).padStart(4, "0");
    items.push(
      i % 2 === 0
        ? record(
            {
              ...fxMystery({ id: `fx.m.geo.${n}` }),
              status: "active",
            } as AnyItem,
            "mystery",
          )
        : record(
            { ...fxEncore({ id: `fx.e.${n}` }), status: "active" } as AnyItem,
            "encore",
          ),
    );
  }
  // Drafts and cut items are never sampled.
  items.push(
    record(
      { ...fxMc({ id: "fx.p.geo.9901" }), status: "draft" } as AnyItem,
      "practice",
    ),
  );
  items.push(
    record(
      { ...fxMc({ id: "fx.p.geo.9902" }), status: "cut" } as AnyItem,
      "practice",
    ),
  );
  return {
    items,
    itemsById: new Map(items.map((r) => [r.id, r])),
    register: null,
    lists: new Map(),
  } as unknown as Bank;
}

const draw = (bank: Bank, seed: number, sizes = { practice: 400, daily: 60 }) =>
  drawAudit(bank, {
    auditId: "audit-2026-11-04",
    date: "2026-11-04",
    seed,
    purpose: "prelaunch",
    auditor: AUDITOR,
    planter: PLANTER,
    practice: sizes.practice,
    daily: sizes.daily,
    plants: 25,
    packetId: ids(),
  });

/** 25 plants, 13 of them subtle, in the source formats. */
function plants(count = 25, subtle = 13): PlantFile[] {
  return Array.from({ length: count }, (_, i) => ({
    defect:
      i < subtle
        ? (SUBTLE_DEFECTS[i % SUBTLE_DEFECTS.length] ?? "date_off")
        : "wrong_key",
    subtle: i < subtle,
    item: (i % 5 === 4
      ? fxEncore({
          id: `fx.e.98${String(i).padStart(2, "0")}`,
          answer: 300 + i,
        })
      : fxMc({
          id: `fx.p.geo.98${String(i).padStart(2, "0")}`,
          stem: `Which instrument opens the fixture fair of Halvessa in year ${1200 + i}?`,
        })) as unknown as Record<string, unknown>,
  }));
}

/** The auditor's verdicts: fail on every plant but `missed`, and on `flag` real items. */
function verdicts(
  rec: AuditRecord,
  missed = 1,
  flag: string[] = [],
): { packetId: string; verdict: "pass" | "fail"; defect?: string }[] {
  return [
    ...rec.sample.map((entry) =>
      flag.includes(entry.itemId)
        ? {
            packetId: entry.packetId,
            verdict: "fail" as const,
            defect: "a date is off",
          }
        : { packetId: entry.packetId, verdict: "pass" as const },
    ),
    ...rec.plants.map((plant, i) =>
      i < missed
        ? { packetId: plant.packetId, verdict: "pass" as const }
        : {
            packetId: plant.packetId,
            verdict: "fail" as const,
            defect: plant.defect,
          },
    ),
  ];
}

describe("the seeded draw", () => {
  it("draws the same sample from the same seed and bank, and another from another seed", () => {
    const bank = activeBank(600, 100);
    const a = draw(bank, 7).record.sample.map((e) => e.itemId);
    const b = draw(bank, 7).record.sample.map((e) => e.itemId);
    const c = draw(bank, 8).record.sample.map((e) => e.itemId);
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
    expect(a).toHaveLength(460);
    expect(a.every((id) => !id.startsWith("fx.p.geo.99"))).toBe(true);
  });

  it("leaves out items the auditor checked and the batches the planter worked on (§0.2)", () => {
    const bank = activeBank(10, 0);
    const checked = bank.items[0] as BankItem;
    checked.item = {
      ...checked.item,
      verification: {
        checks: [{ checker: "fc-fx-auditor" }],
      },
    } as unknown as AnyItem;
    const result = draw(bank, 1, { practice: 10, daily: 0 });
    expect(result.excluded.auditor).toBe(1);
    expect(result.record.sample.map((e) => e.itemId)).not.toContain(checked.id);
    expect(result.short.practice).toBe(1);
  });
});

describe("packing, verdicts and re-checks", () => {
  it("mixes the plants in under opaque ids, records their defects and never their text", () => {
    const bank = activeBank(20, 4);
    const drawn = draw(bank, 3, { practice: 20, daily: 4 }).record;
    const packed = packAudit(bank, drawn, plants(5, 3), {
      now: "2026-11-04T12:00:00Z",
      packetId: ids("p"),
    });
    expect(packed.record.status).toBe("packed");
    expect(packed.record.counts).toMatchObject({ planted: 5, subtle: 3 });
    const items = packed.packet.items as Record<string, unknown>[];
    expect(items).toHaveLength(29);
    // Nothing in the packet tells a plant from a real item: no ids, no
    // statuses, no notes, no checks, no estimate.
    for (const item of items)
      for (const field of [
        "id",
        "status",
        "writerNotes",
        "verification",
        "predicted",
        "seededDifficulty",
        "tags",
        "rivals",
        "likelyGuesses",
      ])
        expect(Object.keys(item)).not.toContain(field);
    const text = JSON.stringify(packed.packet);
    expect(text).not.toContain("fx.p.geo.98");
    expect(text).not.toContain("fx.p.geo.10");
    // ...and the record holds no plant text.
    expect(JSON.stringify(packed.record)).not.toContain("fixture fair");
    expect(() => AuditRecordSchema.parse(packed.record)).not.toThrow();
  });

  it("refuses a plant whose subtlety contradicts its defect, or whose item fails its schema", () => {
    expect(
      plantProblems({ defect: "date_off", subtle: false, item: fxMc() }),
    ).toEqual([expect.stringContaining("subtle")]);
    expect(
      plantProblems({
        defect: "wrong_key",
        subtle: false,
        item: { ...fxMc(), stem: 3 },
      }).join(" "),
    ).toContain("item.stem");
    expect(
      plantProblems({ defect: "wrong_key", subtle: false, item: fxMc() }),
    ).toEqual([]);
  });

  it("takes every verdict or none, and closes once each flagged item is re-checked", () => {
    const bank = activeBank(20, 4);
    const drawn = draw(bank, 3, { practice: 20, daily: 4 }).record;
    const packed = packAudit(bank, drawn, plants(5, 3), {
      now: "now",
      packetId: ids("p"),
    }).record;
    const partial = applyVerdicts(packed, verdicts(packed).slice(1));
    expect(partial.record).toBeUndefined();
    expect(partial.errors.join(" ")).toContain("have no verdict");
    const flagged = packed.sample[0]?.itemId ?? "";
    const audited = applyVerdicts(packed, verdicts(packed, 1, [flagged]));
    expect(audited.record?.status).toBe("audited");
    expect(audited.record?.counts).toMatchObject({ caught: 4, flagged: 1 });
    const cleared = settleFlagged(
      null,
      audited.record as AuditRecord,
      flagged,
      {
        error: false,
        rechecks: [],
      },
    );
    expect(cleared.record?.status).toBe("closed");
    const noLink = settleFlagged(null, audited.record as AuditRecord, flagged, {
      error: true,
      rechecks: [],
    });
    expect(noLink.errors.join(" ")).toContain("links to its re-checks");
  });
});

describe("AC-CNT-05", () => {
  /** A full pre-launch audit: 400 + 60 drawn, 25 plants with 13 subtle, `missed` uncaught. */
  function fullAudit(missed: number, confirmed = false): AuditRecord {
    const bank = activeBank(700, 120);
    const drawn = draw(bank, 2026).record;
    const packed = packAudit(bank, drawn, plants(), {
      now: "now",
      packetId: ids("p"),
    }).record;
    const flagged = packed.sample[5]?.itemId ?? "";
    const audited = applyVerdicts(packed, verdicts(packed, missed, [flagged]))
      .record as AuditRecord;
    return settleFlagged(null, audited, flagged, {
      error: confirmed,
      rechecks: confirmed ? ["verification.rechecks[0]"] : [],
    }).record as AuditRecord;
  }

  it("AC-CNT-05 a closed pre-launch audit of 400 practice and 60 Daily items with 24 of 25 plants caught and no confirmed error passes", () => {
    const passing = fullAudit(1);
    expect(passing.counts).toEqual({
      practice: 400,
      daily: 60,
      planted: 25,
      subtle: 13,
      caught: 24,
      flagged: 1,
      confirmedErrors: 0,
    });
    expect(AuditRecordSchema.safeParse(passing).success).toBe(true);
    expect(auditCriteria(passing)).toEqual([]);
  });

  it("AC-CNT-05 fails on two missed plants, a confirmed real error, too small a sample or too few subtle plants", () => {
    expect(auditCriteria(fullAudit(2)).join(" ")).toContain(
      "23 of 25 planted items caught",
    );
    expect(auditCriteria(fullAudit(1, true)).join(" ")).toContain(
      "1 confirmed error",
    );
    const passing = fullAudit(1);
    const smaller = { ...passing, sample: passing.sample.slice(1) };
    expect(
      auditCriteria({ ...smaller, counts: countsOf(smaller) }).join(" "),
    ).toContain("399 practice items sampled");
    const blatant = {
      ...passing,
      plants: passing.plants.map((plant) => ({ ...plant, subtle: false })),
    };
    expect(
      auditCriteria({ ...blatant, counts: countsOf(blatant) }).join(" "),
    ).toContain("0 of 25 planted items are subtle");
    // More plants need 96%: 25 of 26.
    const more = {
      ...passing,
      plants: [
        ...passing.plants,
        {
          packetId: "pk-zzzzzzzz",
          defect: "wrong_key" as const,
          subtle: false,
          caught: false,
        },
      ],
    };
    expect(
      auditCriteria({ ...more, counts: countsOf(more) }).join(" "),
    ).toContain("24 of 26 planted items caught; at least 25");
  });

  it("AC-CNT-05 is read from the latest pre-launch record: a warning in a normal check, an error at launch, and an error when no record exists at launch", () => {
    const failing = fullAudit(2);
    const sources = [
      {
        rel: "content/.sealed-plain/audits/audit-2026-11-04.json",
        data: failing as unknown,
      },
    ];
    expect(
      auditFindings(sources, { launch: false }).map(
        (f) => `${f.severity} ${f.rule}`,
      ),
    ).toEqual(["warn X32"]);
    expect(
      auditFindings(sources, { launch: true }).map(
        (f) => `${f.severity} ${f.rule}`,
      ),
    ).toEqual(["error X32"]);
    expect(
      auditFindings([], { launch: true }).map((f) => `${f.severity} ${f.rule}`),
    ).toEqual(["error X32"]);
    expect(
      auditFindings(
        [{ rel: "x/audit-2026-11-04.json", data: { id: "audit-2026-11-04" } }],
        { launch: false },
      )[0]?.rule,
    ).toBe("C01");
  });

  it("AC-CNT-05 a seeded-audit dry run writes and validates an audit record through the real command, and touches nothing under content/", async () => {
    // A throwaway repository with a fixture tree of active items.
    const repo = tempDir("qz-audit-");
    writeFileSync(join(repo, "package.json"), "{}\n");
    for (const path of [
      "content/categories.json",
      "content/reference",
      "content/datasets/manifest.json",
    ])
      cpSync(join(REPO_ROOT, path), join(repo, path), { recursive: true });
    const root = await acceptedTree(join(repo, "tree"), [
      "fx.p.geo.0101",
      "fx.p.geo.0102",
      "fx.p.geo.0103",
      "fx.m.geo.0101",
      "fx.e.0101",
    ]);
    const cli = (...args: string[]) => {
      const run = spawnSync(
        process.execPath,
        [
          "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
          join(REPO_ROOT, "scripts/content/audit.ts"),
          ...args,
          "--root",
          root,
          "--fixtures",
        ],
        {
          cwd: repo,
          encoding: "utf8",
          env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: repo },
        },
      );
      return { code: run.status, out: `${run.stdout}${run.stderr}` };
    };
    const id = "audit-2026-11-04";
    const drawn = cli(
      "--seed",
      "11",
      "--audit",
      id,
      "--date",
      "2026-11-04",
      "--auditor",
      AUDITOR.id,
      "--auditor-model",
      AUDITOR.model,
      "--planter",
      PLANTER.id,
      "--planter-model",
      PLANTER.model,
      "--practice",
      "3",
      "--daily",
      "1",
      "--plants",
      "2",
      "--dry-run",
    );
    expect(drawn.out).toContain("drew 3 practice and 1 Daily item(s)");
    expect(drawn.code).toBe(0);
    const cache = join(repo, ".cache/audits", id);
    const recordFile = join(cache, "record.json");
    expect(existsSync(recordFile)).toBe(true);
    expect(existsSync(join(root, "audits"))).toBe(false);
    expect(
      JSON.parse(readFileSync(join(cache, "planter.json"), "utf8")),
    ).toMatchObject({ plants: 2, subtleAtLeast: 1 });

    mkdirSync(join(cache, "planted"), { recursive: true });
    plants(2, 1).forEach((plant, i) =>
      writeFileSync(
        join(cache, "planted", `0${i + 1}.json`),
        JSON.stringify(plant),
      ),
    );
    const packed = cli("pack", "--audit", id);
    expect(packed.out).toContain(
      "packed 4 real and 2 planted item(s) (1 subtle)",
    );
    const record = AuditRecordSchema.parse(
      JSON.parse(readFileSync(recordFile, "utf8")),
    );
    const flagged = record.sample[0]?.itemId ?? "";
    const verdictFile = join(repo, "verdicts.json");
    writeFileSync(verdictFile, JSON.stringify(verdicts(record, 0, [flagged])));
    expect(cli("verdicts", "--audit", id, "--file", verdictFile).out).toContain(
      "2 of 2 planted item(s) caught",
    );
    const confirmed = cli(
      "confirm",
      "--audit",
      id,
      "--item",
      flagged,
      "--cleared",
    );
    expect(confirmed.out).toContain("is closed");

    // The record validates; this small sample misses AC-CNT-05's floors, a
    // warning in a normal check and an error at launch.
    const checked = cli("check", "--audit", id, "--json");
    expect(checked.code).toBe(0);
    const report = JSON.parse(checked.out.slice(checked.out.indexOf("{"))) as {
      findings: { rule: string; severity: string }[];
    };
    expect(report.findings.filter((f) => f.rule === "C01")).toEqual([]);
    expect(
      report.findings.every((f) => f.rule === "X32" && f.severity === "warn"),
    ).toBe(true);
    expect(cli("check", "--audit", id, "--launch").code).toBe(1);
    // A dry run writes nothing under content/ or into the fixture tree.
    expect(existsSync(join(root, "audits"))).toBe(false);
  }, 60_000);
});
