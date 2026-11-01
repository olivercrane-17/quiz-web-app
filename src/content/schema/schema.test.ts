// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  fxComparison,
  fxCountryList,
  fxEncore,
  fxMc,
  fxMystery,
  fxPack,
  fxRegister,
  fxRoomQuestion,
  fxTf,
} from "../pipeline/__fixtures__/builders.ts";
import {
  ANSWER_LIST_SCHEMAS,
  AnswerListSchema,
  BatchRegisterSchema,
  CategoriesFileSchema,
  CheckRecordSchema,
  ClaimSchema,
  DatasetManifestSchema,
  DecisionInputSchema,
  EncoreSchema,
  MysterySchema,
  MythsFileSchema,
  PracticeItemSchema,
  RecordInputSchema,
  RoomPackSchema,
  RoomQuestionSchema,
  ScheduleMonthSchema,
  SlursFileSchema,
  SpareSetSchema,
  SpellingFileSchema,
  StopwordsFileSchema,
  VerificationSchema,
} from "./index.ts";

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8"));

function messages(result: {
  success: boolean;
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}): string[] {
  return result.success
    ? []
    : (result.error?.issues ?? []).map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      );
}

const check = {
  checker: "fc-a1",
  pass: "A",
  brief: "confirm",
  packetSha256: "a".repeat(64),
  startedAt: "2026-11-02T10:00:00Z",
  finishedAt: "2026-11-02T10:06:00Z",
  coldSolve: {
    answerGiven: "Bone flute",
    confidence: "high",
    matchedKey: true,
  },
  claimResults: [
    {
      claimId: "c1",
      verdict: "confirmed",
      method: "knowledge",
      evidence: {
        kind: "knowledge",
        basis: "reference",
        restatement: "A bone flute opens it.",
        confidence: "certain",
      },
      note: "",
    },
  ],
  issues: [],
  searchesUsed: 0,
  verdict: "pass",
};

describe("item schemas", () => {
  it.each([
    ["mc", fxMc()],
    ["tf", fxTf()],
    ["comparison", fxComparison()],
  ])("accepts a valid %s practice item", (_format, item) => {
    expect(messages(PracticeItemSchema.safeParse(item))).toEqual([]);
  });

  it("accepts a valid mystery, encore and room question", () => {
    expect(messages(MysterySchema.safeParse(fxMystery()))).toEqual([]);
    expect(messages(EncoreSchema.safeParse(fxEncore()))).toEqual([]);
    expect(messages(RoomQuestionSchema.safeParse(fxRoomQuestion(1)))).toEqual(
      [],
    );
    expect(
      messages(
        RoomPackSchema.safeParse(
          fxPack([fxRoomQuestion(1), fxRoomQuestion(2)]),
        ),
      ),
    ).toEqual([]);
  });

  it("refuses unknown keys", () => {
    expect(
      messages(PracticeItemSchema.safeParse({ ...fxMc(), notes: "x" })),
    ).toEqual([expect.stringContaining("notes")]);
    expect(
      PracticeItemSchema.safeParse({ ...fxMc(), options: ["a", "b"] }).success,
    ).toBe(false);
    expect(MysterySchema.safeParse({ ...fxMystery(), hint: "x" }).success).toBe(
      false,
    );
  });

  it.each([
    "counterintuitive",
    "claims",
    "tags",
    "learnMore",
    "seededDifficulty",
    "reviewBy",
  ])("requires the common field %s", (field) => {
    const item: Record<string, unknown> = { ...fxMc() };
    delete item[field];
    expect(PracticeItemSchema.safeParse(item).success).toBe(false);
  });

  it.each([
    ["tf", "tfKind", fxTf],
    ["comparison", "relation", fxComparison],
    ["comparison", "measure", fxComparison],
    ["comparison", "values", fxComparison],
    ["comparison", "valueDisplay", fxComparison],
  ] as const)("requires the + field %s.%s", (_format, field, build) => {
    const item: Record<string, unknown> = { ...build() };
    delete item[field];
    expect(PracticeItemSchema.safeParse(item).success).toBe(false);
  });

  it.each(["likelyGuesses", "rivals", "giveawayTerms", "sourceLabels"])(
    "requires the mystery field %s",
    (field) => {
      const item: Record<string, unknown> = { ...fxMystery() };
      delete item[field];
      expect(MysterySchema.safeParse(item).success).toBe(false);
    },
  );

  it("requires derivation (null or object) and seededDifficulty on encores", () => {
    const noDerivation: Record<string, unknown> = { ...fxEncore() };
    delete noDerivation.derivation;
    expect(EncoreSchema.safeParse(noDerivation).success).toBe(false);
    const noSeed: Record<string, unknown> = { ...fxEncore() };
    delete noSeed.seededDifficulty;
    expect(EncoreSchema.safeParse(noSeed).success).toBe(false);
  });

  it("checks ids against their pool's pattern", () => {
    expect(
      PracticeItemSchema.safeParse(fxMc({ id: "p.xyz.0101" })).success,
    ).toBe(false);
    expect(
      MysterySchema.safeParse(fxMystery({ id: "m.geo.101" })).success,
    ).toBe(false);
    expect(EncoreSchema.safeParse(fxEncore({ id: "e.01" })).success).toBe(
      false,
    );
    expect(
      PracticeItemSchema.safeParse(fxMc({ id: "p.geo.0101" })).success,
    ).toBe(true);
  });

  it("ties reviewBy to volatility and refuses fast", () => {
    expect(
      messages(
        PracticeItemSchema.safeParse(
          fxMc({ volatility: "slow", reviewBy: null }),
        ),
      ),
    ).toEqual([expect.stringContaining("needs a reviewBy")]);
    expect(
      PracticeItemSchema.safeParse(
        fxMc({ volatility: "slow", reviewBy: "2028-11-01" }),
      ).success,
    ).toBe(true);
    expect(
      PracticeItemSchema.safeParse(fxMc({ reviewBy: "2028-11-01" })).success,
    ).toBe(false);
    expect(
      PracticeItemSchema.safeParse({ ...fxMc(), volatility: "fast" }).success,
    ).toBe(false);
  });

  it("needs the claims a format calls for", () => {
    const noKey = fxMc({
      claims: fxMc().claims.filter((claim) => claim.role !== "key"),
    });
    expect(messages(PracticeItemSchema.safeParse(noKey))).toEqual([
      expect.stringContaining("role key"),
    ]);
    const noLabel = fxComparison({
      claims: fxComparison().claims.filter((claim) => claim.ref !== "b"),
    });
    expect(messages(PracticeItemSchema.safeParse(noLabel))).toEqual([
      expect.stringContaining('ref "b"'),
    ]);
    const noClue4 = fxMystery({
      claims: fxMystery().claims.filter((claim) => claim.ref !== "clue:4"),
    });
    expect(messages(MysterySchema.safeParse(noClue4))).toEqual([
      expect.stringContaining("clue:4"),
    ]);
    const twoValues = fxEncore({
      claims: [
        ...fxEncore().claims,
        {
          id: "c9",
          role: "value",
          risk: "high",
          riskReason: "number",
          text: "x",
        },
      ],
    });
    expect(messages(EncoreSchema.safeParse(twoValues))).toEqual([
      expect.stringContaining("exactly one claim with role value"),
    ]);
  });

  it("links derivation inputs to input claims", () => {
    const derivation = {
      formula: "a + b",
      inputs: [{ claimId: "c2", value: 1, unit: "steps", what: "x" }],
      unrounded: 212,
      rounding: "none",
    };
    expect(EncoreSchema.safeParse(fxEncore({ derivation })).success).toBe(
      false,
    );
    const claims = [
      ...fxEncore().claims.slice(0, 1),
      {
        id: "c2",
        role: "input" as const,
        risk: "standard" as const,
        text: "One step.",
      },
      {
        id: "c3",
        role: "explanation" as const,
        risk: "standard" as const,
        text: "x",
      },
    ];
    expect(
      messages(EncoreSchema.safeParse(fxEncore({ derivation, claims }))),
    ).toEqual([]);
  });

  it("requires a full verification record and predicted values for active items", () => {
    const result = PracticeItemSchema.safeParse(fxMc({ status: "active" }));
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("verification record"),
        expect.stringContaining("predicted"),
      ]),
    );
  });

  it("gates by status: drafts need shape only; from checking on, predicted and verification", () => {
    expect(PracticeItemSchema.safeParse(fxMc()).success).toBe(true);
    for (const status of ["checking", "retired"] as const) {
      expect(messages(PracticeItemSchema.safeParse(fxMc({ status })))).toEqual([
        expect.stringContaining("predicted"),
        expect.stringContaining("verification record"),
      ]);
    }
    const ready = fxMc({
      status: "checking",
      predicted: { p: 0.7, spread: 0.3, estimator: "v0" },
      verification: { checks: [] },
    });
    expect(messages(PracticeItemSchema.safeParse(ready))).toEqual([]);
    expect(PracticeItemSchema.safeParse(fxMc({ status: "cut" })).success).toBe(
      true,
    );
    expect(
      RoomQuestionSchema.safeParse({ ...fxRoomQuestion(1), status: "checking" })
        .success,
    ).toBe(false);
  });

  it("requires the encore display units from checking on (ARCHITECTURE §5.2)", () => {
    const { unitShort: _short, unitLabel: _label, ...bare } = fxEncore();
    expect(EncoreSchema.safeParse(bare).success).toBe(true);
    const checking = {
      ...bare,
      status: "checking",
      predicted: { pClose: 0.3, pExact: 0.02, spread: 0.4, estimator: "v0" },
      verification: { checks: [] },
    };
    expect(messages(EncoreSchema.safeParse(checking))).toEqual([
      expect.stringContaining("carries unitShort"),
      expect.stringContaining("carries unitLabel"),
    ]);
    expect(
      EncoreSchema.safeParse({
        ...checking,
        unitShort: "steps",
        unitLabel: "steps to the lamp",
      }).success,
    ).toBe(true);
    expect(
      EncoreSchema.safeParse({ ...fxEncore(), unitAbbrev: "st" }).success,
    ).toBe(false);
  });

  it("needs no explanation claim: an explanation may state no new fact (lint X08 warns)", () => {
    const claims = fxMc().claims.filter(
      (claim) => claim.role !== "explanation",
    );
    expect(messages(PracticeItemSchema.safeParse(fxMc({ claims })))).toEqual(
      [],
    );
  });

  it("caps mystery lists: 6 to 12 likely guesses, at least 3 rivals, 4 clues, 3 distractors", () => {
    expect(
      MysterySchema.safeParse(
        fxMystery({ likelyGuesses: fxMystery().likelyGuesses.slice(0, 5) }),
      ).success,
    ).toBe(false);
    expect(
      MysterySchema.safeParse(
        fxMystery({ rivals: fxMystery().rivals.slice(0, 2) }),
      ).success,
    ).toBe(false);
    expect(
      MysterySchema.safeParse({ ...fxMystery(), clues: ["a", "b", "c"] })
        .success,
    ).toBe(false);
    expect(
      MysterySchema.safeParse({
        ...fxMystery(),
        distractors: ["fx.x.country.belloria"],
      }).success,
    ).toBe(false);
  });

  it("keeps room questions to exactly three wrong options", () => {
    const question = fxRoomQuestion(1);
    expect(
      RoomQuestionSchema.safeParse({
        ...question,
        wrong: question.wrong.slice(0, 2),
      }).success,
    ).toBe(false);
  });
});

describe("claims", () => {
  it("needs a riskReason exactly when the risk is high", () => {
    expect(
      ClaimSchema.safeParse({ id: "c1", role: "key", risk: "high", text: "x" })
        .success,
    ).toBe(false);
    expect(
      ClaimSchema.safeParse({
        id: "c1",
        role: "key",
        risk: "standard",
        riskReason: "date",
        text: "x",
      }).success,
    ).toBe(false);
    expect(
      ClaimSchema.safeParse({
        id: "c1",
        role: "key",
        risk: "high",
        riskReason: "date",
        text: "x",
      }).success,
    ).toBe(true);
    expect(
      ClaimSchema.safeParse({
        id: "x2",
        role: "label",
        ref: "a",
        risk: "standard",
        text: "x",
      }).success,
    ).toBe(true);
    expect(
      ClaimSchema.safeParse({
        id: "k1",
        role: "key",
        risk: "standard",
        text: "x",
      }).success,
    ).toBe(false);
  });
});

describe("verification records", () => {
  it("accepts the §12.15 shape", () => {
    expect(messages(CheckRecordSchema.safeParse(check))).toEqual([]);
    expect(
      messages(
        VerificationSchema.safeParse({
          checks: [
            check,
            { ...check, checker: "fc-b2", pass: "B", brief: "refute" },
          ],
          tiebreak: null,
          editor: {
            editor: "ed-1",
            decision: "accept",
            reason: "ok",
            decidedAt: "2026-11-02T11:00:00Z",
          },
          dedupe: {
            checkedAt: "2026-11-02T10:10:00Z",
            nearestId: null,
            score: 0,
            verdict: "unique",
          },
          mythsScreen: { checkedAt: "2026-11-02T10:10:00Z", hits: [] },
          lint: { version: "1.0", passed: true, warnings: [] },
          rechecks: [],
        }),
      ),
    ).toEqual([]);
  });

  it("enforces the verdict definitions of §9.4", () => {
    const refuted = {
      ...check,
      claimResults: [{ ...check.claimResults[0], verdict: "refuted" }],
    };
    expect(messages(CheckRecordSchema.safeParse(refuted))).toEqual([
      expect.stringContaining("verdict must be fail"),
    ]);
    const blocker = {
      ...check,
      issues: [{ type: "ambiguity", severity: "blocker", note: "two answers" }],
    };
    expect(messages(CheckRecordSchema.safeParse(blocker))).toEqual([
      expect.stringContaining("verdict must be fail"),
    ]);
    const fixable = {
      ...check,
      issues: [{ type: "wording", severity: "fix", note: "clumsy" }],
    };
    expect(messages(CheckRecordSchema.safeParse(fixable))).toEqual([
      expect.stringContaining("verdict must be revise"),
    ]);
    expect(
      CheckRecordSchema.safeParse({ ...fixable, verdict: "revise" }).success,
    ).toBe(true);
  });

  it("pairs passes with briefs and keeps T out of checks", () => {
    expect(
      CheckRecordSchema.safeParse({ ...check, brief: "refute" }).success,
    ).toBe(false);
    expect(
      VerificationSchema.safeParse({
        checks: [{ ...check, pass: "T", brief: "tiebreak" }],
      }).success,
    ).toBe(false);
    expect(
      VerificationSchema.safeParse({ checks: [check, check] }).success,
    ).toBe(false);
  });

  it("confirms with knowledge only when certain, and with the web only on Tier A or B without conflict", () => {
    const likely = {
      ...check,
      claimResults: [
        {
          ...check.claimResults[0],
          evidence: {
            ...check.claimResults[0]?.evidence,
            confidence: "likely",
          },
        },
      ],
    };
    expect(messages(CheckRecordSchema.safeParse(likely))).toEqual([
      expect.stringContaining("only a certain knowledge check"),
    ]);
    const web = (tiers: string[], conflictReported: boolean) => ({
      ...check,
      claimResults: [
        {
          claimId: "c1",
          verdict: "confirmed",
          method: "web",
          evidence: {
            kind: "web",
            query: "q",
            results: [{ title: "t", url: "https://example.org/a" }],
            summaryExcerpt: "s",
            tiers,
            conflictReported,
            retrievedAt: "2026-10-31",
          },
          note: "",
        },
      ],
    });
    expect(CheckRecordSchema.safeParse(web(["C"], false)).success).toBe(false);
    expect(CheckRecordSchema.safeParse(web(["B"], true)).success).toBe(false);
    expect(CheckRecordSchema.safeParse(web(["A", "C"], false)).success).toBe(
      true,
    );
  });

  it("insists the method matches the evidence kind", () => {
    const mismatch = {
      ...check,
      claimResults: [{ ...check.claimResults[0], method: "dataset" }],
    };
    expect(messages(CheckRecordSchema.safeParse(mismatch))).toEqual([
      expect.stringContaining("method is dataset"),
    ]);
  });

  it("stores a sealed neighbour of a plaintext item as nearestId sealed with no score", () => {
    const record = (nearestId: string | null, score: number | null) =>
      VerificationSchema.safeParse({
        checks: [],
        dedupe: {
          checkedAt: "2026-11-02T10:00:00Z",
          nearestId,
          score,
          verdict: "related_ok",
        },
      }).success;
    expect(record("sealed", null)).toBe(true);
    expect(record("p.geo.0102", 0.6)).toBe(true);
    expect(record(null, 0)).toBe(true);
    expect(record("sealed", 0.7)).toBe(false);
    expect(record("m.geo.0102", null)).toBe(false);
  });

  it("records estimator runs, barred checkers and wording-only rewrites", () => {
    expect(
      VerificationSchema.safeParse({
        checks: [],
        estimates: [{ by: "es-run7", at: "2026-11-02T10:00:00Z" }],
      }).success,
    ).toBe(true);
    expect(
      VerificationSchema.safeParse({
        checks: [],
        estimates: [{ by: "fc-run7", at: "2026-11-02T10:00:00Z" }],
      }).success,
    ).toBe(false);
    const register = fxRegister() as { batches: Record<string, unknown>[] };
    register.batches[0] = {
      ...register.batches[0],
      incidents: [
        {
          date: "2026-11-02",
          kind: "fabricated_source",
          note: "c3 cited a page nobody retrieved",
          checkers: ["fc-fx-alpha"],
        },
      ],
    };
    expect(messages(BatchRegisterSchema.safeParse(register))).toEqual([]);
    expect(
      DecisionInputSchema.safeParse([
        {
          itemId: "p.geo.0101",
          editor: "ed-1",
          decision: "rewrite",
          reason: "Shorter stem.",
          edits: { stem: "Which instrument opens it?" },
          wordingOnly: true,
        },
      ]).success,
    ).toBe(true);
  });

  it("parses checker input files and editor decisions", () => {
    expect(
      RecordInputSchema.safeParse([{ itemId: "p.geo.0101", ...check }]).success,
    ).toBe(true);
    expect(RecordInputSchema.safeParse([check]).success).toBe(false);
    expect(
      DecisionInputSchema.safeParse([
        {
          itemId: "p.geo.0101",
          editor: "ed-1",
          decision: "accept",
          reason: "ok",
        },
      ]).success,
    ).toBe(true);
    expect(
      DecisionInputSchema.safeParse([
        {
          itemId: "p.geo.0101",
          editor: "fc-1",
          decision: "accept",
          reason: "ok",
        },
      ]).success,
    ).toBe(false);
  });
});

describe("answer lists, schedules and the register", () => {
  it("validates lists per type, qualifier included, and refuses build-only keys", () => {
    expect(messages(AnswerListSchema.safeParse(fxCountryList()))).toEqual([]);
    const list = fxCountryList() as { entities: Record<string, unknown>[] };
    const withKeys = {
      ...list,
      entities: [{ ...list.entities[0], keys: ["arvenna"] }],
    };
    expect(AnswerListSchema.safeParse(withKeys).success).toBe(false);
    const badQualifier = {
      ...list,
      entities: [{ ...list.entities[0], qualifier: { iso_a2: "arv" } }],
    };
    expect(AnswerListSchema.safeParse(badQualifier).success).toBe(false);
    expect(
      ANSWER_LIST_SCHEMAS.element.safeParse({ ...list, type: "element" })
        .success,
    ).toBe(false);
    expect(
      AnswerListSchema.safeParse({
        type: "planet",
        version: "2026-01-01",
        provenance: [],
        entities: [],
      }).success,
    ).toBe(false);
  });

  it("validates schedule months and spare sets", () => {
    const daily = {
      date: "2026-12-01",
      rounds: [
        { type: "mystery", difficulty: "easy", contentId: "m.geo.0101" },
      ],
      status: "assembled",
      predictedPoints: 3.3,
      dayCheck: null,
    };
    expect(
      ScheduleMonthSchema.safeParse({ track: "main", dailies: [daily] })
        .success,
    ).toBe(true);
    expect(
      ScheduleMonthSchema.safeParse({ track: "main", dailies: [daily, daily] })
        .success,
    ).toBe(false);
    expect(
      ScheduleMonthSchema.safeParse({
        track: "main",
        dailies: [{ ...daily, status: "live" }],
      }).success,
    ).toBe(false);
    const spare = {
      id: "spare-01",
      track: "main",
      rounds: daily.rounds,
      status: "assembled",
      predictedPoints: 3,
      dayCheck: null,
    };
    expect(SpareSetSchema.safeParse(spare).success).toBe(true);
    const { track: _track, ...noTrack } = spare;
    expect(SpareSetSchema.safeParse(noTrack).success).toBe(false);
  });

  it("types rounds as ARCHITECTURE §3.3 does: mc, tf, comparison, mystery, encore", () => {
    const month = (type: string) => ({
      track: "main",
      dailies: [
        {
          date: "2026-12-01",
          rounds: [{ type, difficulty: null, contentId: "fx.r.dly.01" }],
          status: "assembled",
          predictedPoints: 0,
          dayCheck: null,
        },
      ],
    });
    for (const type of ["mc", "tf", "comparison", "mystery", "encore"])
      expect(ScheduleMonthSchema.safeParse(month(type)).success, type).toBe(
        true,
      );
    expect(ScheduleMonthSchema.safeParse(month("choice")).success).toBe(false);
  });

  it("keeps register entries consistent with their batch ids", () => {
    expect(messages(BatchRegisterSchema.safeParse(fxRegister()))).toEqual([]);
    const register = fxRegister() as { batches: Record<string, unknown>[] };
    const wrongCategory = {
      batches: [{ ...register.batches[0], category: "hist" }],
    };
    expect(BatchRegisterSchema.safeParse(wrongCategory).success).toBe(false);
    const plannedWithWriter = {
      batches: [{ ...register.batches[0], status: "planned" }],
    };
    expect(BatchRegisterSchema.safeParse(plannedWithWriter).success).toBe(
      false,
    );
    const listByWriter = {
      batches: [{ ...register.batches[4], writer: "w-x" }],
    };
    expect(BatchRegisterSchema.safeParse(listByWriter).success).toBe(false);
  });
});

describe("the committed content files", () => {
  it("parse against their schemas", () => {
    expect(
      messages(
        CategoriesFileSchema.safeParse(readJson("content/categories.json")),
      ),
    ).toEqual([]);
    expect(
      messages(BatchRegisterSchema.safeParse(readJson("content/batches.json"))),
    ).toEqual([]);
    expect(
      messages(
        DatasetManifestSchema.safeParse(
          readJson("content/datasets/manifest.json"),
        ),
      ),
    ).toEqual([]);
    expect(
      messages(
        SpellingFileSchema.safeParse(
          readJson("content/reference/spelling.json"),
        ),
      ),
    ).toEqual([]);
    expect(
      messages(
        StopwordsFileSchema.safeParse(
          readJson("content/reference/stopwords.json"),
        ),
      ),
    ).toEqual([]);
    expect(
      messages(
        MythsFileSchema.safeParse(readJson("content/reference/myths.json")),
      ),
    ).toEqual([]);
    expect(
      messages(
        SlursFileSchema.safeParse(readJson("content/reference/slurs.json")),
      ),
    ).toEqual([]);
  });

  it("seed at least 80 myths and a non-empty slur list", () => {
    const myths = MythsFileSchema.parse(
      readJson("content/reference/myths.json"),
    );
    expect(myths.myths.length).toBeGreaterThanOrEqual(80);
    const slurs = SlursFileSchema.parse(
      readJson("content/reference/slurs.json"),
    );
    expect(slurs.terms.length).toBeGreaterThan(20);
  });

  it("start the register with the production plan", () => {
    const { batches } = BatchRegisterSchema.parse(
      readJson("content/batches.json"),
    );
    const pool = (name: string) =>
      batches.filter((batch) => batch.pool === name);
    expect(pool("practice")).toHaveLength(24);
    for (const batch of pool("practice")) {
      expect(batch.plan).toMatchObject({
        target: 63,
        difficulty: { easy: 25, medium: 25, hard: 13 },
        format: { mc: 50, tf: 6, comparison: 7 },
      });
    }
    expect(pool("mystery")).toHaveLength(12);
    expect(
      pool("mystery").every(
        (b) => b.plan.target === 30 && b.batchId.endsWith(".b01"),
      ),
    ).toBe(true);
    expect(pool("encore").map((b) => b.batchId)).toEqual([
      "e.b01",
      "e.b02",
      "e.b03",
    ]);
    const perCategory = new Map<string, number>();
    for (const batch of pool("encore")) {
      expect(batch.plan.target).toBe(40);
      for (const [category, n] of Object.entries(batch.plan.categories ?? {}))
        perCategory.set(category, (perCategory.get(category) ?? 0) + n);
    }
    expect([...perCategory.values()]).toEqual(Array(12).fill(10));
    expect(pool("room")).toHaveLength(8);
    expect(pool("room").every((b) => b.plan.target === 15)).toBe(true);
    const listTarget = (type: string) =>
      pool("list")
        .filter((b) => b.answerType === type)
        .reduce((sum, b) => sum + b.plan.target, 0);
    expect(listTarget("country")).toBe(190);
    expect(listTarget("person")).toBe(1000);
    expect(listTarget("element")).toBe(118);
    expect(pool("list")).toHaveLength(38);
    // Production has started: a batch is either still planned with no writer,
    // or past planning with its writer named.
    expect(
      batches.every((batch) =>
        batch.status === "planned"
          ? batch.writer === null
          : typeof batch.writer === "string" && batch.writer.length > 0,
      ),
    ).toBe(true);
  });
});
