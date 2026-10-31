// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import type { DecisionInputEntry, RecordInputEntry } from "../schema/inputs.ts";
import type { AnyItem, McItem, TfItem } from "../schema/items.ts";
import {
  CHECKER_A,
  EDITOR,
  WRITER,
  countryId,
  fxEncore,
  fxFiles,
  fxMc,
  fxRecord,
  fxTf,
  itemOf,
  loadFx,
  type FxFiles,
  removeTempDirs,
} from "./__fixtures__/builders.ts";
import { acceptanceFailures, checksOf, externalSources } from "./acceptance.ts";
import type { Bank } from "./bank.ts";
import { applyDecisions, decideOne } from "./decisions.ts";
import { LINT_VERSION } from "./lint/index.ts";
import { packetSha256 } from "./packets.ts";
import { mergeRecord } from "./records.ts";
import { requireBatch } from "./register.ts";
import { saveItems } from "./store.ts";

afterAll(removeTempDirs);

const PREDICTED = {
  practice: { p: 0.7, spread: 0.3, estimator: "v0" },
  mystery: {
    solveByClue: [0.5, 0.8, 0.92, 0.98],
    spread: 0.3,
    estimator: "v0",
  },
  encore: { pClose: 0.3, pExact: 0.02, spread: 0.4, estimator: "v0" },
};

type Patch = (
  pass: "A" | "B" | "T",
  entry: RecordInputEntry,
) => RecordInputEntry;

/** A bank where one item carries A and B records (and optionally T), and its estimate. */
async function checkedBank(
  id: string,
  opts: { patch?: Patch; tiebreak?: boolean; files?: FxFiles } = {},
): Promise<Bank> {
  const bank = await loadFx(opts.files ?? fxFiles());
  const record = itemOf(bank, id);
  let item: AnyItem = record.item;
  const passes = opts.tiebreak
    ? (["A", "B", "T"] as const)
    : (["A", "B"] as const);
  for (const pass of passes) {
    const entry = fxRecord(bank, record, pass);
    item = mergeRecord(
      item,
      opts.patch ? opts.patch(pass, entry) : entry,
      pass,
      false,
    ).item;
  }
  const pool = record.pool === "room" ? "practice" : record.pool;
  // As content:estimate does: with the estimate and a record, the item is checking.
  item = { ...item, predicted: PREDICTED[pool], status: "checking" } as AnyItem;
  await saveItems(bank, new Map([[id, item]]));
  return bank;
}

function accept(
  bank: Bank,
  id: string,
  patch: Partial<DecisionInputEntry> = {},
) {
  const batchId = id.startsWith("fx.e.")
    ? "e.b01"
    : id.startsWith("fx.m.")
      ? "m.geo.b01"
      : "p.geo.b01";
  const decision: DecisionInputEntry = {
    itemId: id,
    editor: EDITOR,
    decision: "accept",
    reason: "Both checks pass.",
    decidedAt: "2026-11-03T09:00:00Z",
    ...patch,
  };
  return decideOne(
    bank,
    requireBatch(bank, batchId),
    itemOf(bank, id),
    decision,
    { now: "2026-11-03T09:00:00Z" },
  );
}

const failFirst = (entry: RecordInputEntry): RecordInputEntry => ({
  ...entry,
  claimResults: entry.claimResults.map((r, i) =>
    i === 0 ? { ...r, verdict: "refuted" as const } : r,
  ),
  verdict: "fail",
});

describe("the acceptance rule (§9.9)", () => {
  it("accepts two passing checks with external evidence on high-risk claims", async () => {
    for (const id of [
      "fx.p.geo.0101",
      "fx.p.geo.0103",
      "fx.m.geo.0101",
      "fx.e.0101",
    ]) {
      const bank = await checkedBank(id);
      const { outcome, item } = accept(bank, id);
      expect(outcome.errors, id).toEqual([]);
      expect(item?.status).toBe("active");
      expect(item?.verification).toMatchObject({
        editor: { editor: EDITOR, decision: "accept" },
        dedupe: { verdict: "unique" },
        mythsScreen: { hits: [] },
        lint: { version: LINT_VERSION, passed: true },
        tiebreak: null,
        rechecks: [],
      });
    }
  });

  it("rule 1: refuses without both passes, or when a checker is the editor", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const onlyA = {
      ...mergeRecord(record.item, fxRecord(bank, record, "A"), "A", false).item,
      predicted: PREDICTED.practice,
    } as AnyItem;
    await saveItems(bank, new Map([[record.id, onlyA]]));
    expect(accept(bank, record.id).outcome.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("rule 1")]),
    );
    const editorChecked = await checkedBank("fx.p.geo.0101");
    expect(
      accept(editorChecked, "fx.p.geo.0101", {
        editor: `ed-${CHECKER_A.slice(3)}`,
      }).outcome.errors,
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("checked this item")]),
    );
  });

  it("rule 2: a revise or fail verdict needs a passed tiebreak; two fails never pass", async () => {
    const revise = await checkedBank("fx.p.geo.0101", {
      patch: (pass, e) =>
        pass === "B"
          ? {
              ...e,
              issues: [
                { type: "wording", severity: "fix", note: "Clumsy stem." },
              ],
              verdict: "revise",
            }
          : e,
    });
    expect(accept(revise, "fx.p.geo.0101").outcome.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("rule 2")]),
    );
    const split = await checkedBank("fx.p.geo.0101", {
      tiebreak: true,
      patch: (pass, e) =>
        pass === "B"
          ? failFirst(e)
          : pass === "T"
            ? {
                ...e,
                claimResults: e.claimResults.map((r) => ({
                  ...r,
                  method: "dataset" as const,
                  evidence: {
                    kind: "dataset" as const,
                    dataset: "mledoze-countries",
                    version: "6031f5df137c41c76d180c55a0782185ae3ed05b",
                    file: "f",
                    locator: "l",
                    excerpt: "e",
                    retrievedAt: "2026-10-31",
                  },
                })),
              }
            : e,
    });
    expect(accept(split, "fx.p.geo.0101").outcome.errors).toEqual([]);
    const both = await checkedBank("fx.p.geo.0101", {
      patch: (_pass, e) => failFirst(e),
    });
    expect(accept(both, "fx.p.geo.0101").outcome.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("both checks failed")]),
    );
  });

  it("rule 3: high-risk claims need dataset or web evidence; encore values need two sources", async () => {
    const knowledgeOnly: Patch = (_pass, e) => ({
      ...e,
      claimResults: e.claimResults.map((r) => ({
        ...r,
        method: "knowledge" as const,
        evidence: {
          kind: "knowledge" as const,
          basis: "reference" as const,
          restatement: "r",
          confidence: "certain" as const,
        },
      })),
    });
    const bank = await checkedBank("fx.p.geo.0101", { patch: knowledgeOnly });
    expect(accept(bank, "fx.p.geo.0101").outcome.errors).toEqual([
      expect.stringContaining("high-risk claim c3"),
    ]);
    const oneSource = await checkedBank("fx.e.0101", {
      patch: (pass, e) => (pass === "B" ? knowledgeOnly(pass, e) : e),
    });
    expect(accept(oneSource, "fx.e.0101").outcome.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("two independent external sources"),
      ]),
    );
    const twoSources = await checkedBank("fx.e.0101");
    const item = itemOf(twoSources, "fx.e.0101").item;
    expect(externalSources(checksOf(item), "c1")).toBe(2);
  });

  it("rule 3: an uncertain claim blocks acceptance", async () => {
    const uncertain = await checkedBank("fx.p.geo.0101", {
      patch: (pass, e) =>
        pass === "B"
          ? {
              ...e,
              claimResults: e.claimResults.map((r, i) =>
                i === 1 ? { ...r, verdict: "uncertain" as const } : r,
              ),
              verdict: "revise",
            }
          : e,
    });
    expect(accept(uncertain, "fx.p.geo.0101").outcome.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("claim c2 is not confirmed"),
      ]),
    );
  });

  it("rule 4: a mystery needs uniqueness confirmed and no rival found", async () => {
    const rival = await checkedBank("fx.m.geo.0101", {
      patch: (pass, e) =>
        pass === "B"
          ? {
              ...e,
              issues: [
                {
                  type: "second_answer",
                  severity: "fix",
                  note: "Belloria fits clues 1 to 3.",
                },
              ],
              verdict: "revise",
            }
          : e,
    });
    expect(accept(rival, "fx.m.geo.0101").outcome.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("rule 4")]),
    );
  });

  it("rule 5: lint errors, duplicates and uncleared myth hits block acceptance", async () => {
    const twin = fxMc({
      id: "fx.p.geo.0104",
      stem: "Which instrument opens the spring festival in Halvessa?",
    });
    const files = fxFiles({ "practice/geography/fx.p.geo.0104.json": twin });
    const dup = await checkedBank("fx.p.geo.0101", { files });
    expect(accept(dup, "fx.p.geo.0101").outcome.errors).toEqual([
      expect.stringContaining('set "dedupe": "related_ok"'),
    ]);
    expect(
      accept(dup, "fx.p.geo.0101", { dedupe: "related_ok" }).outcome.errors,
    ).toEqual([]);
    expect(
      accept(dup, "fx.p.geo.0101", { dedupe: "duplicate" }).outcome.errors,
    ).toEqual([expect.stringContaining("dedupe verdict is duplicate")]);

    const failing = acceptanceFailures({
      item: itemOf(await checkedBank("fx.p.geo.0101"), "fx.p.geo.0101").item,
      batch: null,
      editor: EDITOR,
      decidedAt: "2026-11-03T09:00:00Z",
      lintPassed: false,
      dedupe: { nearestId: null, score: 0, verdict: "unique" },
      mythHits: [{ claimId: "c1", mythId: "bats-are-blind", cleared: false }],
    });
    expect(failing).toEqual([
      expect.stringContaining("lint has errors"),
      expect.stringContaining("myths screen not clean"),
    ]);
  });
});

describe("the acceptance rule, hardened", () => {
  const knowledge =
    (claimIds: string[]): Patch =>
    (pass, e) =>
      pass === "B"
        ? {
            ...e,
            claimResults: e.claimResults.map((r) =>
              claimIds.includes(r.claimId)
                ? {
                    ...r,
                    method: "knowledge" as const,
                    evidence: {
                      kind: "knowledge" as const,
                      basis: "reference" as const,
                      restatement: "r",
                      confidence: "certain" as const,
                    },
                  }
                : r,
            ),
          }
        : e;

  it("rule 3: every clue that pins a Daily answer needs two external sources", async () => {
    // A and B confirm everything; B rests clue 2 (c3) on knowledge alone.
    const bank = await checkedBank("fx.m.geo.0101", {
      patch: knowledge(["c3"]),
    });
    expect(accept(bank, "fx.m.geo.0101").outcome.errors).toEqual([
      expect.stringContaining("claim c3 for clue 2 pins the Daily answer"),
    ]);
    // The reviewer's probe: two knowledge-only checks never pass a mystery.
    const allKnowledge: Patch = (_pass, e) =>
      knowledge(e.claimResults.map((r) => r.claimId))("B", e);
    const bare = await checkedBank("fx.m.geo.0101", { patch: allKnowledge });
    expect(
      accept(bare, "fx.m.geo.0101").outcome.errors.filter((e) =>
        e.includes("pins the Daily answer"),
      ),
    ).toHaveLength(3);
  });

  it("rule 4: a rival left after clue 3 fails the mystery, whatever its issue's severity", async () => {
    const bank = await checkedBank("fx.m.geo.0101", {
      patch: (pass, e) =>
        pass === "B"
          ? {
              ...e,
              coldSolve: {
                perClue: [1, 2, 3, 4].map((clue) => ({
                  clue,
                  guess: countryId("Arvenna"),
                  candidates:
                    clue === 3
                      ? [countryId("Arvenna"), "Belloria"]
                      : [countryId("Arvenna")],
                })),
              },
              issues: [
                {
                  type: "ambiguity" as const,
                  severity: "note" as const,
                  note: "Another country also fits clues 1 to 3.",
                },
              ],
            }
          : e,
    });
    expect(accept(bank, "fx.m.geo.0101").outcome.errors).toEqual([
      expect.stringContaining(
        "pass B still had 1 candidate(s) besides the answer after clue 3",
      ),
    ]);
  });

  it("rule 5: a myth hit is cleared only with dataset or web evidence", async () => {
    const claims = [
      ...fxTf().claims,
      {
        id: "c3",
        role: "explanation" as const,
        risk: "standard" as const,
        text: "Bats are blind, so the doors are painted by day.",
      },
    ];
    const files = fxFiles({
      "practice/geography/fx.p.geo.0102.json": fxTf({
        claims,
      } as Partial<TfItem>),
    });
    const knowledgeOnly = await checkedBank("fx.p.geo.0102", { files });
    expect(accept(knowledgeOnly, "fx.p.geo.0102").outcome.errors).toEqual([
      expect.stringContaining("myths screen not clean (claims c3"),
    ]);
    const evidenced = await checkedBank("fx.p.geo.0102", {
      files,
      patch: (pass, e) =>
        pass === "A"
          ? {
              ...e,
              claimResults: e.claimResults.map((r) =>
                r.claimId === "c3"
                  ? {
                      ...r,
                      method: "web" as const,
                      evidence: {
                        kind: "web" as const,
                        query: "fixture bats sight",
                        results: [
                          { title: "Fixture", url: "https://example.org/x" },
                        ],
                        summaryExcerpt: "Invented summary for a fixture.",
                        tiers: ["A" as const],
                        conflictReported: false,
                        retrievedAt: "2026-10-31",
                      },
                    }
                  : r,
              ),
            }
          : e,
    });
    const { outcome, item } = accept(evidenced, "fx.p.geo.0102");
    expect(outcome.errors).toEqual([]);
    expect(item?.verification?.mythsScreen?.hits).toEqual([
      { claimId: "c3", mythId: "bats-are-blind", cleared: true },
    ]);
  });

  it("rule 1: no checker or editor may have estimated the item (§0.2)", async () => {
    const bank = await checkedBank("fx.p.geo.0101");
    const record = itemOf(bank, "fx.p.geo.0101");
    const estimated = {
      ...record.item,
      verification: {
        ...record.item.verification,
        checks: record.item.verification?.checks ?? [],
        estimates: [
          { by: `es-${EDITOR.slice(3)}`, at: "2026-11-02T09:00:00Z" },
        ],
      },
    } as AnyItem;
    await saveItems(bank, new Map([[record.id, estimated]]));
    expect(accept(bank, record.id).outcome.errors).toEqual([
      expect.stringContaining(`editor ${EDITOR} estimated this item`),
    ]);
  });

  it("names neither side of a near-duplicate that crosses the seal, and stores none", async () => {
    const twin: Partial<McItem> = {
      id: "fx.p.geo.0104",
      stem: "Which fixture country flies a silver heron above three blue waves?",
      answer: "Arvenna",
      wrong: ["Belloria", "Cassova", "Dravenor"],
    };
    const files = fxFiles({
      "practice/geography/fx.p.geo.0104.json": fxMc(twin),
    });
    const practice = await checkedBank("fx.p.geo.0104", { files });
    const refused = accept(practice, "fx.p.geo.0104").outcome.errors;
    expect(refused).toEqual([
      expect.stringContaining("near-duplicate of a sealed item"),
    ]);
    expect(refused.join(" ")).not.toContain("fx.m.geo.0101");
    const related = accept(practice, "fx.p.geo.0104", { dedupe: "related_ok" });
    expect(related.outcome.errors).toEqual([]);
    expect(related.item?.verification?.dedupe).toMatchObject({
      nearestId: "sealed",
      score: null,
      verdict: "related_ok",
    });
    const mystery = await checkedBank("fx.m.geo.0101", { files });
    const sealedSide = accept(mystery, "fx.m.geo.0101").outcome.errors;
    expect(sealedSide).toEqual([
      expect.stringContaining("near-duplicate of a public item"),
    ]);
    expect(sealedSide.join(" ")).not.toContain("fx.p.geo.0104");
  });
});

describe("content:decide", () => {
  it("cuts, and a key-changing rewrite clears the checks and returns the item to draft", async () => {
    const bank = await checkedBank("fx.p.geo.0101");
    const batch = requireBatch(bank, "p.geo.b01");
    const { outcomes } = await applyDecisions(
      bank,
      batch,
      [
        {
          itemId: "fx.p.geo.0101",
          editor: EDITOR,
          decision: "rewrite",
          reason: "Tighter key.",
          edits: { answer: "Heron flute" },
        },
        {
          itemId: "fx.p.geo.0102",
          editor: EDITOR,
          decision: "cut",
          reason: "Too close to a Daily item.",
        },
      ],
      { now: "2026-11-03T09:00:00Z" },
    );
    expect(
      outcomes.map((o) => [o.itemId, o.ok, o.status, o.checksCleared ?? false]),
    ).toEqual([
      ["fx.p.geo.0101", true, "draft", true],
      ["fx.p.geo.0102", true, "cut", false],
    ]);
    expect(itemOf(bank, "fx.p.geo.0101").item.verification?.checks).toEqual([]);
    expect(
      itemOf(bank, "fx.p.geo.0101").item.verification?.editor?.decision,
    ).toBe("rewrite");
  });

  it("accept edits only sourceLabels, tags, lintAllow and reviewBy", async () => {
    const bank = await checkedBank("fx.p.geo.0101");
    const sneaky = accept(bank, "fx.p.geo.0101", {
      edits: { answer: "Heron flute" },
    });
    expect(sneaky.outcome.errors).toEqual([
      expect.stringContaining("accept may edit only sourceLabels"),
    ]);
    // The reviewer's repro: a reworded true/false statement and new facts.
    const stem = accept(bank, "fx.p.geo.0101", {
      edits: {
        stem: "Which instrument opens every festival in the world?",
        explanation: "It is 9,000 years old and was first played by Orth.",
      },
    });
    expect(stem.outcome.errors).toEqual([
      expect.stringContaining("stem, explanation need a rewrite"),
    ]);
    const tidy = accept(bank, "fx.p.geo.0101", {
      edits: {
        tags: ["fixtures", "festivals"],
        lintAllow: [{ rule: "C19", text: "x", reason: "fixture" }],
      },
    });
    expect(tidy.outcome.errors).toEqual([]);
    expect(tidy.item?.status).toBe("active");
    expect(
      accept(bank, "fx.p.geo.0101", { edits: { status: "active" } }).outcome
        .errors,
    ).toEqual([expect.stringContaining("may not set status")]);
  });

  it("refuses an item edited after its checks, however the edit was made", async () => {
    const bank = await checkedBank("fx.p.geo.0101");
    const record = itemOf(bank, "fx.p.geo.0101");
    // A direct file edit that swaps the key, as the reviewer did.
    const edited = {
      ...record.item,
      answer: "Reed pipe",
      wrong: ["Brass horn", "Hand drum", "Bone flute"],
    } as AnyItem;
    await saveItems(bank, new Map([[record.id, edited]]));
    expect(accept(bank, record.id).outcome.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("the item changed after pass A was recorded"),
        expect.stringContaining("the item changed after pass B was recorded"),
      ]),
    );
  });

  it("a rewrite of anything a packet shows clears the checks and the estimate", async () => {
    const bank = await checkedBank("fx.p.geo.0101");
    const { outcome, item } = accept(bank, "fx.p.geo.0101", {
      decision: "rewrite",
      edits: { learnMore: "Halvessa festival (fixture)" },
    });
    expect(outcome.checksCleared).toBe(true);
    expect(item?.status).toBe("draft");
    expect(item?.verification?.checks).toEqual([]);
    expect(item).not.toHaveProperty("predicted");
    // Edits no packet shows keep the checks as they are.
    const tags = accept(bank, "fx.p.geo.0101", {
      decision: "rewrite",
      edits: { tags: ["fixtures", "festivals"], writerNotes: "Re-read." },
    });
    expect(tags.item?.verification?.checks).toHaveLength(2);
    expect(tags.item?.status).toBe("checking");
  });

  it("a wordingOnly rewrite keeps the checks, re-stamps their packets and leaves a trail", async () => {
    const bank = await checkedBank("fx.p.geo.0101");
    const record = itemOf(bank, "fx.p.geo.0101");
    const before = record.item.verification?.checks.map((c) => c.packetSha256);
    const stem = "Which instrument opens the spring festival of Halvessa?";
    const { outcome, item } = accept(bank, "fx.p.geo.0101", {
      decision: "rewrite",
      wordingOnly: true,
      reason: "Shorter stem.",
      edits: { stem },
    });
    expect(outcome.errors).toEqual([]);
    expect(item?.status).toBe("checking");
    const after = item?.verification?.checks.map((c) => c.packetSha256);
    expect(after).toEqual(
      (["A", "B"] as const).map((pass) =>
        packetSha256(record.id, item as AnyItem, pass),
      ),
    );
    expect(after).not.toEqual(before);
    const reason = item?.verification?.editor?.reason ?? "";
    expect(reason).toContain(`wording-only rewrite by ${EDITOR}`);
    for (const hash of before ?? []) expect(reason).toContain(hash);
    // Accepting afterwards keeps the trail.
    await saveItems(bank, new Map([[record.id, item as AnyItem]]));
    const accepted = accept(bank, "fx.p.geo.0101");
    expect(accepted.outcome.errors).toEqual([]);
    expect(accepted.item?.verification?.editor?.reason).toContain(
      "wording-only rewrite by",
    );
  });

  it("wordingOnly never covers a claim-bearing field or a true/false statement", async () => {
    const bank = await checkedBank("fx.p.geo.0101");
    expect(
      accept(bank, "fx.p.geo.0101", {
        decision: "rewrite",
        wordingOnly: true,
        edits: { answer: "Heron flute" },
      }).outcome.errors,
    ).toEqual([expect.stringContaining("answer change a claim")]);
    const tf = await checkedBank("fx.p.geo.0102");
    expect(
      accept(tf, "fx.p.geo.0102", {
        decision: "rewrite",
        wordingOnly: true,
        edits: {
          stem: "The river Vellum in Arvenna is the longest river in the world.",
        },
      }).outcome.errors,
    ).toEqual([expect.stringContaining("stem change a claim")]);
  });

  it("refuses to rewrite an item both checks failed (§9.7)", async () => {
    const both = await checkedBank("fx.p.geo.0101", {
      patch: (_pass, e) => failFirst(e),
    });
    expect(
      accept(both, "fx.p.geo.0101", {
        decision: "rewrite",
        edits: { answer: "Heron flute" },
      }).outcome.errors,
    ).toEqual([expect.stringContaining("cut it and draft the replacement")]);
  });

  it("accepts only when every lint warning has the editor's lintAllow", async () => {
    const long = {
      wrong: ["A brass horn from the hills", "Hand drum", "Reed pipe"],
    };
    const files = fxFiles({
      "practice/geography/fx.p.geo.0101.json": fxMc(long),
    });
    const bank = await checkedBank("fx.p.geo.0101", { files });
    const refused = accept(bank, "fx.p.geo.0101");
    expect(refused.outcome.errors).toEqual([
      expect.stringMatching(/^C04 wrong\[0\]: .*lintAllow/),
    ]);
    const allowed = accept(bank, "fx.p.geo.0101", {
      edits: {
        lintAllow: [
          {
            rule: "C04",
            text: "A brass horn from the hills",
            reason: "The full name reads better; the grid wraps it.",
          },
        ],
      },
    });
    expect(allowed.outcome.errors).toEqual([]);
    expect(allowed.outcome.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("C04 wrong[0]: waived")]),
    );
    expect(allowed.item?.verification?.lint?.warnings).toEqual([
      expect.objectContaining({ rule: "C04", path: "wrong[0]" }),
    ]);
  });

  it("refuses an editor who wrote the batch, and items outside the batch", async () => {
    const bank = await checkedBank("fx.p.geo.0101");
    expect(
      accept(bank, "fx.p.geo.0101", { editor: `ed-${WRITER.slice(2)}` }).outcome
        .errors,
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("wrote this batch")]),
    );
    const { outcomes } = await applyDecisions(
      bank,
      requireBatch(bank, "e.b01"),
      [
        {
          itemId: "fx.p.geo.0101",
          editor: EDITOR,
          decision: "cut",
          reason: "x",
        },
      ],
      { now: "2026-11-03T09:00:00Z" },
    );
    expect(outcomes[0]?.errors).toEqual([
      expect.stringContaining("not an item of e.b01"),
    ]);
  });

  it("refuses to accept an item the estimator has not scored", async () => {
    const bank = await loadFx(
      fxFiles({ "encores/fx.e.0101.json": fxEncore() }),
    );
    const record = itemOf(bank, "fx.e.0101");
    let item: AnyItem = record.item;
    for (const pass of ["A", "B"] as const)
      item = mergeRecord(item, fxRecord(bank, record, pass), pass, false).item;
    await saveItems(bank, new Map([[record.id, item]]));
    expect(accept(bank, "fx.e.0101").outcome.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("predicted")]),
    );
  });
});
