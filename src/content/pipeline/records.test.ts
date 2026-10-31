// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import type { RecordInputEntry } from "../schema/inputs.ts";
import {
  CHECKER_A,
  CHECKER_B,
  MLEDOZE_COMMIT,
  WRITER,
  fxFiles,
  fxMc,
  fxRecord,
  itemOf,
  loadFx,
  removeTempDirs,
} from "./__fixtures__/builders.ts";
import type { Bank } from "./bank.ts";
import { checkRecord, mergeRecord, searchUse } from "./records.ts";
import { requireBatch } from "./register.ts";
import { saveItems } from "./store.ts";

afterAll(removeTempDirs);

function check(
  bank: Bank,
  id: string,
  pass: "A" | "B" | "T",
  entry: RecordInputEntry,
) {
  const batchId = id.startsWith("fx.m.")
    ? "m.geo.b01"
    : id.startsWith("fx.e.")
      ? "e.b01"
      : "p.geo.b01";
  return checkRecord(
    bank,
    requireBatch(bank, batchId),
    pass,
    itemOf(bank, id),
    entry,
  );
}

describe("content:record validation", () => {
  it("accepts an honest record for every kind and pass", async () => {
    const bank = await loadFx();
    for (const id of [
      "fx.p.geo.0101",
      "fx.p.geo.0102",
      "fx.p.geo.0103",
      "fx.m.geo.0101",
      "fx.e.0101",
    ]) {
      for (const pass of ["A", "B"] as const) {
        expect(
          check(bank, id, pass, fxRecord(bank, itemOf(bank, id), pass)).errors,
          `${id} ${pass}`,
        ).toEqual([]);
      }
    }
  });

  it("rejects a record by the writer, even under a checker prefix", async () => {
    const bank = await loadFx();
    const entry = fxRecord(bank, itemOf(bank, "fx.p.geo.0101"), "A", {
      checker: `fc-${WRITER.slice(2)}`,
    });
    expect(check(bank, "fx.p.geo.0101", "A", entry).errors).toEqual([
      expect.stringContaining("is the batch's writer"),
    ]);
  });

  it("rejects a packetSha256 that does not match the current packet", async () => {
    const bank = await loadFx();
    const entry = fxRecord(bank, itemOf(bank, "fx.p.geo.0101"), "A", {
      packetSha256: "0".repeat(64),
    });
    const errors = check(bank, "fx.p.geo.0101", "A", entry).errors;
    expect(errors).toEqual([
      expect.stringContaining("packetSha256 does not match"),
    ]);
    // The expected value is never printed, so it cannot be copied in.
    const real = fxRecord(bank, itemOf(bank, "fx.p.geo.0101"), "A");
    expect(errors.join(" ")).not.toContain(real.packetSha256);
    const otherPass = fxRecord(bank, itemOf(bank, "fx.p.geo.0101"), "B");
    expect(
      check(bank, "fx.p.geo.0101", "A", {
        ...otherPass,
        pass: "A",
        brief: "confirm",
        checker: CHECKER_A,
      }).errors,
    ).toEqual([expect.stringContaining("packetSha256 does not match")]);
  });

  it("rejects the same checker on both passes", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const merged = mergeRecord(
      record.item,
      fxRecord(bank, record, "A"),
      "A",
      false,
    ).item;
    await saveItems(bank, new Map([[record.id, merged]]));
    const entry = fxRecord(bank, itemOf(bank, "fx.p.geo.0101"), "B", {
      checker: CHECKER_A,
    });
    expect(check(bank, "fx.p.geo.0101", "B", entry).errors).toEqual([
      expect.stringContaining("already did pass A"),
    ]);
  });

  it("rejects missing or unknown claims, and a pass that does not match --pass", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const full = fxRecord(bank, record, "A");
    const missing = { ...full, claimResults: full.claimResults.slice(1) };
    expect(check(bank, record.id, "A", missing).errors).toEqual([
      expect.stringContaining("no result for claim(s) c1"),
    ]);
    const unknown = {
      ...full,
      claimResults: [
        ...full.claimResults,
        {
          ...full.claimResults[0],
          claimId: "c9",
        } as (typeof full.claimResults)[number],
      ],
    };
    expect(check(bank, record.id, "A", unknown).errors).toEqual([
      expect.stringContaining("claim c9 is not in the item"),
    ]);
    const extra = {
      ...full,
      claimResults: [
        ...full.claimResults,
        {
          ...full.claimResults[0],
          claimId: "x1",
        } as (typeof full.claimResults)[number],
      ],
    };
    expect(check(bank, record.id, "A", extra).errors).toEqual([]);
    expect(check(bank, record.id, "B", full).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("--pass is B")]),
    );
  });

  it("rejects dataset evidence that is not pinned in the manifest", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const full = fxRecord(bank, record, "A");
    const withEvidence = (dataset: string, version: string) => ({
      ...full,
      claimResults: full.claimResults.map((result) =>
        result.evidence.kind === "dataset"
          ? { ...result, evidence: { ...result.evidence, dataset, version } }
          : result,
      ),
    });
    expect(
      check(
        bank,
        record.id,
        "A",
        withEvidence("invented-atlas", MLEDOZE_COMMIT),
      ).errors,
    ).toEqual([
      expect.stringContaining("not in content/datasets/manifest.json"),
    ]);
    expect(
      check(bank, record.id, "A", withEvidence("mledoze-countries", "main"))
        .errors,
    ).toEqual([expect.stringContaining("is pinned at")]);
  });

  it("insists on honest cold solves", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const full = fxRecord(bank, record, "A");
    const lie = {
      ...full,
      coldSolve: {
        answerGiven: "Hand drum",
        confidence: "high" as const,
        matchedKey: true,
      },
    };
    expect(check(bank, record.id, "A", lie).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("matchedKey is true")]),
    );
    const miss = {
      ...full,
      coldSolve: {
        answerGiven: "Hand drum",
        confidence: "low" as const,
        matchedKey: false,
      },
    };
    expect(check(bank, record.id, "A", miss).errors).toEqual([
      expect.stringContaining("cold miss needs an issue"),
    ]);
    const explained = {
      ...miss,
      issues: [
        {
          type: "ambiguity" as const,
          severity: "note" as const,
          note: "I did not know the festival.",
        },
      ],
    };
    expect(check(bank, record.id, "A", explained).errors).toEqual([]);
    const made = {
      ...full,
      coldSolve: {
        answerGiven: "Kazoo",
        confidence: "low" as const,
        matchedKey: false,
      },
    };
    expect(check(bank, record.id, "A", made).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("not one of the packet's options"),
      ]),
    );
  });

  it("wants rivals after clue 3 explained in a mystery record", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.m.geo.0101");
    const full = fxRecord(bank, record, "A");
    const perClue = [1, 2, 3, 4].map((clue) => ({
      clue,
      guess: "fx.x.country.arvenna",
      candidates:
        clue === 3
          ? ["fx.x.country.arvenna", "fx.x.country.belloria"]
          : ["fx.x.country.arvenna"],
    }));
    expect(
      check(bank, record.id, "A", { ...full, coldSolve: { perClue } }).errors,
    ).toEqual([
      expect.stringContaining("after clue 3: explain them"),
      expect.stringContaining("confirms the uniqueness claim but lists 1"),
    ]);
    // Explained as a note while confirming uniqueness: still contradictory.
    const note = {
      ...full,
      coldSolve: { perClue },
      issues: [
        {
          type: "ambiguity" as const,
          severity: "note" as const,
          note: "Another country fits clues 1 to 3 as far as I know.",
        },
      ],
    };
    expect(check(bank, record.id, "A", note).errors).toEqual([
      expect.stringContaining("confirms the uniqueness claim but lists 1"),
    ]);
    // Doubting the uniqueness claim instead is honest.
    const doubted = {
      ...note,
      claimResults: full.claimResults.map((result) =>
        result.claimId === "c1"
          ? { ...result, verdict: "uncertain" as const }
          : result,
      ),
      verdict: "revise" as const,
    };
    expect(check(bank, record.id, "A", doubted).errors).toEqual([]);
    // The clue-3 candidates are the uniqueness test, so they must be there.
    expect(
      check(bank, record.id, "A", {
        ...full,
        coldSolve: { perClue: perClue.slice(0, 2) },
      }).errors,
    ).toEqual([expect.stringContaining("needs clues 1 to 3")]);
    expect(
      check(bank, record.id, "A", {
        ...full,
        coldSolve: { estimate: 3, reasoning: "x" },
      }).errors,
    ).toEqual([expect.stringContaining("perClue")]);
  });

  it("refuses a checker who estimated the item, or one a fabricated-source incident barred", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const estimated = {
      ...record.item,
      verification: {
        checks: [],
        estimates: [
          { by: `es-${CHECKER_A.slice(3)}`, at: "2026-11-02T09:00:00Z" },
        ],
      },
    } as typeof record.item;
    await saveItems(bank, new Map([[record.id, estimated]]));
    expect(
      check(bank, record.id, "A", fxRecord(bank, itemOf(bank, record.id), "A"))
        .errors,
    ).toEqual([expect.stringContaining("estimated this item")]);

    const barred = await loadFx();
    const batch = requireBatch(barred, "p.geo.b01");
    batch.incidents.push({
      date: "2026-11-02",
      kind: "fabricated_source",
      note: "c3 cited a page nobody retrieved",
      checkers: [CHECKER_B.toUpperCase()],
    });
    const entry = fxRecord(barred, itemOf(barred, "fx.p.geo.0101"), "B");
    expect(
      checkRecord(barred, batch, "B", itemOf(barred, "fx.p.geo.0101"), entry)
        .errors,
    ).toEqual([expect.stringContaining("fabricated-source incident")]);
  });

  it("refuses records for active or cut items", async () => {
    const bank = await loadFx(
      fxFiles({
        "practice/geography/fx.p.geo.0101.json": fxMc({ status: "cut" }),
      }),
    );
    const entry = fxRecord(bank, itemOf(bank, "fx.p.geo.0101"), "A");
    expect(check(bank, "fx.p.geo.0101", "A", entry).errors).toEqual([
      expect.stringContaining("is cut"),
    ]);
  });
});

describe("merging", () => {
  it("puts A and B in checks and T in tiebreak", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    let item = mergeRecord(
      record.item,
      fxRecord(bank, record, "B"),
      "B",
      false,
    ).item;
    item = mergeRecord(item, fxRecord(bank, record, "A"), "A", false).item;
    item = mergeRecord(item, fxRecord(bank, record, "T"), "T", false).item;
    expect(item.verification?.checks.map((c) => c.pass)).toEqual(["A", "B"]);
    expect(item.verification?.tiebreak?.checker).toBe("fc-fx-tango");
    expect(item.verification?.checks[0]).not.toHaveProperty("itemId");
    expect(record.item.status).toBe("draft");
  });

  it("moves a draft to checking only once it also carries the estimate (§2.3)", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const withoutEstimate = mergeRecord(
      record.item,
      fxRecord(bank, record, "A"),
      "A",
      false,
    ).item;
    expect(withoutEstimate.status).toBe("draft");
    const estimated = {
      ...record.item,
      predicted: { p: 0.7, spread: 0.3, estimator: "v0" },
    } as typeof record.item;
    expect(
      mergeRecord(estimated, fxRecord(bank, record, "A"), "A", false).item
        .status,
    ).toBe("checking");
  });

  it("refuses to overwrite a pass without --replace", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const once = mergeRecord(
      record.item,
      fxRecord(bank, record, "A"),
      "A",
      false,
    ).item;
    expect(() =>
      mergeRecord(once, fxRecord(bank, record, "A"), "A", false),
    ).toThrow(/--replace/);
    const twice = mergeRecord(
      once,
      fxRecord(bank, record, "A", { checker: "fc-fx-second" }),
      "A",
      true,
    );
    expect(twice.replaced).toBe(true);
    expect(twice.item.verification?.checks).toHaveLength(1);
    expect(twice.item.verification?.checks[0]?.checker).toBe("fc-fx-second");
  });

  it("counts searches against the batch cap", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const item = mergeRecord(
      record.item,
      fxRecord(bank, record, "A", { searchesUsed: 3 }),
      "A",
      false,
    ).item;
    await saveItems(bank, new Map([[record.id, item]]));
    expect(searchUse(bank, requireBatch(bank, "p.geo.b01"))).toEqual({
      used: 3,
      budget: 4,
    });
    void CHECKER_B;
  });
});
