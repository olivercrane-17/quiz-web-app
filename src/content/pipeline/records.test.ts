// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import {
  RecordInputEntrySchema,
  type RecordInputEntry,
} from "../schema/inputs.ts";
import {
  CHECKER_A,
  CHECKER_B,
  MLEDOZE_COMMIT,
  WRITER,
  fxFiles,
  fxMc,
  fxRecord,
  fxServeLog,
  itemOf,
  loadFx,
  removeTempDirs,
} from "./__fixtures__/builders.ts";
import type { Bank } from "./bank.ts";
import type { ServeLog } from "./packets.ts";
import {
  barredCheckers,
  checkRecord,
  mergeRecord,
  recordFileErrors,
  searchUse,
} from "./records.ts";
import { requireBatch } from "./register.ts";
import { saveItems } from "./store.ts";

afterAll(removeTempDirs);

function check(
  bank: Bank,
  id: string,
  pass: "A" | "B" | "T",
  entry: RecordInputEntry,
  served?: ServeLog | null,
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
    served === undefined
      ? fxServeLog(batchId, pass, [itemOf(bank, id)])
      : served,
  );
}

/** When fxRecord's checker recorded stage k's cold solve. */
const recordedAt = (stage: number) => `2026-11-02T10:0${stage - 1}:30Z`;

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

  it("holds packetSha256 and stagesServedAt to what content:packets served, stage by stage (§9.4)", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const real = fxRecord(bank, record, "A");
    const wrong = { ...real, packetSha256: ["0".repeat(64), "1".repeat(64)] };
    const errors = check(bank, record.id, "A", wrong).errors;
    expect(errors).toEqual([
      expect.stringContaining(
        "packetSha256 is not the list of hashes content:packets served",
      ),
    ]);
    // The expected values are never printed, so they cannot be copied in.
    for (const hash of real.packetSha256)
      expect(errors.join(" ")).not.toContain(hash);
    // Another pass's packet, relabelled.
    const otherPass = fxRecord(bank, record, "B");
    expect(
      check(bank, record.id, "A", {
        ...otherPass,
        pass: "A",
        brief: "confirm",
        checker: CHECKER_A,
      }).errors,
    ).toEqual([
      expect.stringContaining(
        "packetSha256 is not the list of hashes content:packets served",
      ),
    ]);
    // Served times copied wrong.
    expect(
      check(bank, record.id, "A", {
        ...real,
        stagesServedAt: ["2026-11-02T10:00:00Z", "2026-11-02T10:02:00Z"],
      }).errors,
    ).toEqual([expect.stringContaining("stagesServedAt is not the list")]);
    // One hash for the whole packet is the older form, and no longer taken.
    expect(
      check(bank, record.id, "A", {
        ...real,
        packetSha256: "0".repeat(64),
        stagesServedAt: undefined,
      } as never).errors,
    ).toEqual([expect.stringContaining("one hash per stage served")]);
    // No packet served, or not all of it.
    expect(check(bank, record.id, "A", real, null).errors).toEqual([
      expect.stringContaining("no packet of pass A was served"),
    ]);
    const partial = fxServeLog("p.geo.b01", "A", [record]);
    const entry = partial.items[record.id];
    if (!entry) throw new Error("no served entry");
    entry.served = entry.served.slice(0, 1);
    expect(check(bank, record.id, "A", real, partial).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("1 of the packet's 2 stages were served"),
      ]),
    );
    // Served for an item that has changed since.
    const edited = await loadFx(
      fxFiles({
        "practice/geography/fx.p.geo.0101.json": fxMc({
          stem: "Which instrument opens the fixture festival in Halvessa?",
        }),
      }),
    );
    expect(
      check(
        edited,
        record.id,
        "A",
        real,
        fxServeLog("p.geo.b01", "A", [record]),
      ).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("the item changed after its pass A packet"),
      ]),
    );
    // A cold-solve entry without its recordedAt, or written after the next
    // stage was served, makes the record invalid.
    const cold = real.coldSolve as Record<string, unknown>;
    const { recordedAt: _at, ...untimed } = cold;
    expect(
      check(bank, record.id, "A", { ...real, coldSolve: untimed as never })
        .errors,
    ).toEqual([expect.stringContaining("no recordedAt for stage(s) 1")]);
    expect(
      RecordInputEntrySchema.safeParse({
        ...real,
        coldSolve: { ...cold, recordedAt: "2026-11-02T10:01:10Z" },
      }).success,
    ).toBe(false);
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
        !Array.isArray(result.evidence) && result.evidence.kind === "dataset"
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
        recordedAt: recordedAt(1),
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
        recordedAt: recordedAt(1),
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
      recordedAt: recordedAt(clue),
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
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("needs clues 1 to 3")]),
    );
    expect(
      check(bank, record.id, "A", {
        ...full,
        coldSolve: { estimate: 3, reasoning: "x" },
      }).errors,
    ).toEqual(expect.arrayContaining([expect.stringContaining("perClue")]));
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
    const barredItem = itemOf(barred, "fx.p.geo.0101");
    const entry = fxRecord(barred, barredItem, "B");
    expect(
      checkRecord(
        barred,
        batch,
        "B",
        barredItem,
        entry,
        fxServeLog("p.geo.b01", "B", [barredItem]),
      ).errors,
    ).toEqual([expect.stringContaining("fabricated-source incident")]);
  });

  it("refuses the checker an invalid_check incident barred, and says which incident", async () => {
    const bank = await loadFx();
    const batch = requireBatch(bank, "p.geo.b01");
    batch.incidents.push(
      // Only fabricated_source and invalid_check incidents bar anyone.
      {
        date: "2026-11-01",
        kind: "other",
        note: "A late submission.",
        checkers: [CHECKER_A],
      },
      {
        date: "2026-11-04",
        kind: "invalid_check",
        note: "Pass B records were templated.",
        checkers: [CHECKER_B],
      },
    );
    expect(barredCheckers(batch)).toEqual([CHECKER_B]);
    const record = itemOf(bank, "fx.p.geo.0101");
    expect(
      check(bank, record.id, "A", fxRecord(bank, record, "A")).errors,
    ).toEqual([]);
    const entry = fxRecord(bank, record, "B", { checker: "fc-FX-bravo" });
    expect(check(bank, record.id, "B", entry).errors).toEqual([
      "checker fc-FX-bravo is barred from this batch by its invalid_check incident of 2026-11-04, which voided their records; a new checker id records this pass",
    ]);
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

  it("refuses a knowledge restatement that repeats the claim's wording", async () => {
    const bank = await loadFx();
    const item = itemOf(bank, "fx.p.geo.0101");
    const honest = fxRecord(bank, item, "A");
    const claim = item.item.claims[0];
    const copied: RecordInputEntry = {
      ...honest,
      claimResults: honest.claimResults.map((result) =>
        result.claimId === claim?.id &&
        !Array.isArray(result.evidence) &&
        result.evidence.kind === "knowledge"
          ? {
              ...result,
              evidence: {
                ...result.evidence,
                restatement: `${claim.text.toUpperCase()}!`,
              },
            }
          : result,
      ),
    };
    const knowledge = honest.claimResults.some(
      (result) =>
        result.claimId === claim?.id &&
        !Array.isArray(result.evidence) &&
        result.evidence.kind === "knowledge",
    );
    expect(knowledge).toBe(true);
    expect(check(bank, "fx.p.geo.0101", "A", copied).errors).toEqual([
      expect.stringContaining("repeats the claim's wording"),
    ]);
  });

  it("refuses a record file made faster than its items can be checked", async () => {
    const bank = await loadFx();
    const mystery = itemOf(bank, "fx.m.geo.0101");
    const at = (start: string, end: string) =>
      Array.from({ length: 5 }, () => ({
        ...fxRecord(bank, mystery, "A"),
        startedAt: start,
        finishedAt: end,
      }));
    // Five mysteries need at least 150 s; one minute is a script.
    expect(
      recordFileErrors(
        bank,
        at("2026-11-02T10:00:00Z", "2026-11-02T10:01:00Z"),
      ),
    ).toEqual([expect.stringContaining("never from a script")]);
    expect(
      recordFileErrors(
        bank,
        at("2026-11-02T10:00:00Z", "2026-11-02T10:05:00Z"),
      ),
    ).toEqual([]);
    // Fewer than five records (a tiebreak) are exempt.
    expect(
      recordFileErrors(
        bank,
        at("2026-11-02T10:00:00Z", "2026-11-02T10:00:10Z").slice(0, 4),
      ),
    ).toEqual([]);
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
