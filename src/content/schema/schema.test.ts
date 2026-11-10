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
import { CLAIM_ID_PATTERN } from "./claims.ts";
import { countedTier, isExternalSource } from "./verification.ts";

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

/** A retirement record, as content:batch -- retire writes it (CNT-2b). */
const RETIRED = {
  at: "2026-11-05T10:00:00Z",
  by: "ed-fx-editor",
  kind: "cross_pool",
  reason: "Shares its fact with a Daily item.",
} as const;

/** A cross-pool judgment, as content:dedupe -- --cross-pool-ok writes it. */
const JUDGMENT = {
  itemId: "fx.p.geo.0101",
  decision: "related_ok",
  by: "ed-fx-editor",
  at: "2026-11-05T10:00:00Z",
  reason: "The same country, but a different fact.",
  pairSha256: "b".repeat(64),
} as const;

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
    // The editor sets a slow item's reviewBy at acceptance (CONTENT_GUIDE
    // §2.3): a draft or a checking item may hold null, an active one not.
    expect(
      PracticeItemSchema.safeParse(fxMc({ volatility: "slow", reviewBy: null }))
        .success,
    ).toBe(true);
    expect(
      messages(
        PracticeItemSchema.safeParse(
          fxMc({ volatility: "slow", reviewBy: null, status: "retired" }),
        ),
      ),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("needs a reviewBy")]),
    );
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
      const item = fxMc({
        status,
        ...(status === "retired" ? { retired: RETIRED } : {}),
      });
      expect(messages(PracticeItemSchema.safeParse(item))).toEqual([
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

  it("pairs the retired status with its record: when, by which editor, of what kind and why (CNT-2b)", () => {
    const base = {
      predicted: { p: 0.7, spread: 0.3, estimator: "v0" },
      verification: { checks: [] },
    };
    // Retired with its record passes; without one, or a record on any other
    // status, fails on `retired`.
    expect(
      messages(
        PracticeItemSchema.safeParse(
          fxMc({ ...base, status: "retired", retired: RETIRED }),
        ),
      ),
    ).toEqual([]);
    expect(
      messages(
        PracticeItemSchema.safeParse(fxMc({ ...base, status: "retired" })),
      ),
    ).toEqual([expect.stringMatching(/^retired: a retired item records/)]);
    for (const status of ["draft", "checking", "cut"] as const)
      expect(
        messages(
          PracticeItemSchema.safeParse(
            fxMc({ ...base, status, retired: RETIRED }),
          ),
        ),
      ).toEqual(["retired: only a retired item carries a retired record"]);
    // The record's own shape: an editor's id, a known kind, a reason.
    for (const [patch, path] of [
      [{ by: "w-fx-writer" }, "retired.by"],
      [{ kind: "duplicate" }, "retired.kind"],
      [{ reason: "" }, "retired.reason"],
      [{ at: "2026-11-05" }, "retired.at"],
    ] as const) {
      const result = MysterySchema.safeParse(
        fxMystery({
          status: "retired",
          predicted: {
            solveByClue: [0.5, 0.8, 0.92, 0.98],
            spread: 0.3,
            estimator: "v0",
          },
          verification: { checks: [] },
          // A wrong shape on purpose: the schema must refuse it.
          retired: { ...RETIRED, ...patch } as unknown as typeof RETIRED,
        }),
      );
      expect(messages(result).map((m) => m.split(":")[0])).toEqual([path]);
    }
  });

  it("keeps cross-pool judgments on Daily items only, one per pair, naming a practice item or a room question (CNT-2b)", () => {
    // Shapes the schema may refuse, typed loosely on purpose.
    const verification = (crossPool: unknown) => ({
      checks: [],
      crossPool: crossPool as (typeof JUDGMENT)[],
    });
    // A mystery or an encore holds them.
    expect(
      messages(
        MysterySchema.safeParse(
          fxMystery({ verification: verification([JUDGMENT]) }),
        ),
      ),
    ).toEqual([]);
    expect(
      messages(
        EncoreSchema.safeParse(
          fxEncore({
            verification: verification([
              { ...JUDGMENT, itemId: "fx.r.fx-party.03" },
            ]),
          }),
        ),
      ),
    ).toEqual([]);
    // A practice item never does: a public file names no sealed id.
    expect(
      messages(
        PracticeItemSchema.safeParse(
          fxMc({ verification: verification([JUDGMENT]) }),
        ),
      ),
    ).toEqual([
      expect.stringMatching(
        /^verification\.crossPool: a practice item never holds/,
      ),
    ]);
    // A room question's live on the Daily item it sits near.
    expect(
      messages(
        RoomQuestionSchema.safeParse({
          ...fxRoomQuestion(1),
          verification: verification([JUDGMENT]),
        }),
      ),
    ).toEqual([
      expect.stringMatching(/^verification\.crossPool: a room question's/),
    ]);
    // One judgment per pair; the other side is a practice item or a room
    // question; an editor's id; related_ok only; a SHA-256.
    for (const [entries, path] of [
      [[JUDGMENT, { ...JUDGMENT, reason: "Again." }], "crossPool.1.itemId"],
      [[{ ...JUDGMENT, itemId: "fx.m.geo.0102" }], "crossPool.0.itemId"],
      [[{ ...JUDGMENT, by: "fc-fx-alpha" }], "crossPool.0.by"],
      [[{ ...JUDGMENT, decision: "duplicate" }], "crossPool.0.decision"],
      [[{ ...JUDGMENT, pairSha256: "abc" }], "crossPool.0.pairSha256"],
    ] as const) {
      expect(
        messages(VerificationSchema.safeParse(verification(entries))).map(
          (m) => m.split(":")[0],
        ),
      ).toEqual([path]);
    }
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

/**
 * CONTENT_GUIDE §12.15's filled-in record, parsed from the guide itself.
 * Its packet hashes are placeholders ("<sha256 of stage 1>"), which the
 * guide says so; they become real-looking hashes here, and nothing else
 * changes.
 */
function guideRecord(): Record<string, unknown> {
  const guide = readFileSync(join(REPO_ROOT, "docs/CONTENT_GUIDE.md"), "utf8");
  const section = guide
    .split(/^### /m)
    .find((part) => part.startsWith("12.15 "));
  const block = /```json\s*\n([\s\S]*?)```/.exec(section ?? "")?.[1];
  if (block === undefined) throw new Error("no JSON block in §12.15");
  let n = 0;
  const filled = block.replace(/"<sha256 of [^"]*>"/g, () => {
    n += 1;
    return `"${n.toString(16).padStart(64, "0")}"`;
  });
  expect(n).toBe(4);
  return JSON.parse(filled) as Record<string, unknown>;
}

describe("verification records", () => {
  it("accepts CONTENT_GUIDE §12.15's own record, field for field", () => {
    const record = guideRecord();
    expect(messages(VerificationSchema.safeParse(record))).toEqual([]);
    const [a] = record.checks as Record<string, unknown>[];
    expect(messages(CheckRecordSchema.safeParse(a))).toEqual([]);
  });

  it("accepts the one-entry shape that records accepted before the guide's carry", () => {
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
  });

  it("counts a web call at its cited result's tier, or at the lowest it could have relied on (§9.5.2)", () => {
    const call = (
      tiers: string[],
      citedResult?: { title: string; url: string; tier: string } | null,
    ) => ({
      kind: "web",
      query: "q",
      results: [
        { title: "Owner", url: "https://example.org/a" },
        { title: "Blog", url: "https://example.org/c" },
      ],
      summaryExcerpt: "s",
      ...(citedResult === undefined ? {} : { citedResult }),
      tiers,
      conflictReported: false,
      retrievedAt: "2026-10-31",
    });
    const confirmed = (evidence: unknown, method?: string) =>
      CheckRecordSchema.safeParse({
        ...check,
        claimResults: [
          {
            claimId: "c1",
            verdict: "confirmed",
            ...(method ? { method } : {}),
            evidence,
            note: "",
          },
        ],
      });
    const cited = { title: "Owner", url: "https://example.org/a", tier: "A" };
    // Tiers A and C with no attribution count at C: no confirmation, in the
    // guide's array shape or as one entry that names citedResult.
    expect(confirmed([call(["A", "C"], null)]).success).toBe(false);
    expect(confirmed(call(["A", "C"], null)).success).toBe(false);
    expect(messages(confirmed([call(["A", "C"], null)]))).toEqual([
      expect.stringContaining("a confirmed claim needs an entry that confirms"),
    ]);
    // The same call, attributed to the Tier A result, confirms.
    expect(messages(confirmed([call(["A", "C"], cited)]))).toEqual([]);
    expect(messages(confirmed(call(["A", "C"], cited), "web"))).toEqual([]);
    // A cited result is one of the call's results, at one of its tiers.
    expect(
      confirmed([
        call(["A", "C"], { ...cited, url: "https://example.org/elsewhere" }),
      ]).success,
    ).toBe(false);
    expect(confirmed([call(["B", "C"], cited)]).success).toBe(false);
    // countedTier and isExternalSource say the same wherever evidence is
    // counted: a record from before citedResult existed still parses, but
    // its [A, C] call counts at C and is never external evidence.
    const legacy = call(["A", "C"]);
    expect(confirmed(legacy, "web").success).toBe(true);
    expect(countedTier(legacy as never)).toBe("C");
    expect(isExternalSource(legacy as never)).toBe(false);
    expect(countedTier(call(["A", "C"], cited) as never)).toBe("A");
    expect(isExternalSource(call(["A", "C"], cited) as never)).toBe(true);
    expect(countedTier(call(["A", "B"], null) as never)).toBe("B");
  });

  it("takes §9.8's calculation entries, checker_doubt issues, addedClaim and pass-prefixed additions", () => {
    const calculation = {
      kind: "calculation",
      expression: "100 × 1.609344",
      result: 160.9344,
      constants: ["mile"],
      claimIds: [],
    };
    const doubted = {
      ...check,
      claimResults: [
        {
          claimId: "c1",
          verdict: "confirmed",
          evidence: [calculation],
          note: "A pure conversion.",
        },
        {
          claimId: "xA1",
          verdict: "uncertain",
          evidence: [],
          note: "",
          addedClaim: {
            role: "explanation",
            text: "The flute is carved from swan bone.",
            risk: "standard",
          },
        },
      ],
      issues: [
        { type: "checker_doubt", severity: "fix", note: "xA1 is uncertain." },
      ],
      verdict: "revise",
    };
    expect(messages(CheckRecordSchema.safeParse(doubted))).toEqual([]);
    // An addition under a pass prefix says what it added.
    const bare = {
      ...doubted,
      claimResults: [
        doubted.claimResults[0],
        { ...doubted.claimResults[1], addedClaim: undefined },
      ],
    };
    expect(messages(CheckRecordSchema.safeParse(bare))).toEqual([
      expect.stringContaining("give its role, text and risk in addedClaim"),
    ]);
    // A confirmation that rests on nothing confirms nothing.
    const empty = {
      ...check,
      claimResults: [
        { claimId: "c1", verdict: "confirmed", evidence: [], note: "" },
      ],
    };
    expect(CheckRecordSchema.safeParse(empty).success).toBe(false);
    // The guide's merge entry for a checker's duplicate addition.
    expect(
      messages(
        VerificationSchema.safeParse({
          checks: [],
          merge: {
            mergedAt: "2026-11-02T10:55:00Z",
            editor: "ed-1",
            claims: [
              { id: "c3", addedBy: "writer" },
              { id: "xA1", addedBy: "A" },
              { id: "xB2", addedBy: "B" },
            ],
            duplicates: [{ id: "xB2", sameAs: "c3" }],
            sentToFollowUp: ["xA1"],
          },
        }),
      ),
    ).toEqual([]);
    for (const id of ["xA1", "xB12", "xT1", "xD3", "x1", "c4"])
      expect(CLAIM_ID_PATTERN.test(id), id).toBe(true);
    for (const id of ["xC1", "xa1", "xA0", "y1"])
      expect(CLAIM_ID_PATTERN.test(id), id).toBe(false);
  });

  it("holds one served time per stage hash, and each cold-solve entry inside its stage (§9.4)", () => {
    const staged = {
      ...check,
      packetSha256: ["a".repeat(64), "b".repeat(64)],
      stagesServedAt: ["2026-11-02T10:00:00Z", "2026-11-02T10:01:30Z"],
      coldSolve: { ...check.coldSolve, recordedAt: "2026-11-02T10:01:00Z" },
    };
    expect(messages(CheckRecordSchema.safeParse(staged))).toEqual([]);
    expect(
      messages(
        CheckRecordSchema.safeParse({
          ...staged,
          coldSolve: {
            ...staged.coldSolve,
            recordedAt: "2026-11-02T10:02:00Z",
          },
        }),
      ),
    ).toEqual([expect.stringContaining("before stage 2 was")]);
    expect(
      CheckRecordSchema.safeParse({
        ...staged,
        stagesServedAt: ["2026-11-02T10:00:00Z"],
      }).success,
    ).toBe(false);
  });

  it("insists the method matches the evidence kind, and goes only with one entry", () => {
    expect(
      CheckRecordSchema.safeParse({
        ...check,
        claimResults: [
          {
            ...check.claimResults[0],
            evidence: [check.claimResults[0]?.evidence],
          },
        ],
      }).success,
    ).toBe(false);
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
      spareOrder: ["spare.07", "spare.02"],
    };
    expect(
      ScheduleMonthSchema.safeParse({ track: "main", dailies: [daily] })
        .success,
    ).toBe(true);
    // spareOrder (§2.11) holds spare.NN ids, each ranked once. A daily
    // written before the field existed still parses (X30 warns instead).
    const { spareOrder: _order, ...noOrder } = daily;
    expect(
      ScheduleMonthSchema.safeParse({ track: "main", dailies: [noOrder] })
        .success,
    ).toBe(true);
    for (const spareOrder of [["spare-07"], ["spare.07", "spare.07"]]) {
      expect(
        ScheduleMonthSchema.safeParse({
          track: "main",
          dailies: [{ ...daily, spareOrder }],
        }).success,
        spareOrder.join(","),
      ).toBe(false);
    }
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
      id: "spare.01",
      track: "main",
      rounds: daily.rounds,
      status: "assembled",
      predictedPoints: 3,
      dayCheck: null,
    };
    expect(SpareSetSchema.safeParse(spare).success).toBe(true);
    const { track: _track, ...noTrack } = spare;
    expect(SpareSetSchema.safeParse(noTrack).success).toBe(false);
    // Ids are spare.NN as ARCHITECTURE §2.4 names them.
    expect(SpareSetSchema.safeParse({ ...spare, id: "spare-01" }).success).toBe(
      false,
    );
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
          spareOrder: [],
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

  it("counts a batch at close, and lets one an invalid_check incident reopened keep its counts", () => {
    const register = fxRegister() as { batches: Record<string, unknown>[] };
    const entry = (patch: Record<string, unknown>) =>
      BatchRegisterSchema.safeParse({
        batches: [{ ...register.batches[0], ...patch }],
      });
    const incident = {
      date: "2026-11-04",
      kind: "invalid_check",
      note: "Pass B records were templated.",
      checkers: ["fc-fx-bravo"],
    };
    const counts = { accepted: 28, cut: 7 };
    expect(messages(entry({ status: "closed", ...counts }))).toEqual([]);
    expect(
      messages(entry({ status: "checking", ...counts, incidents: [incident] })),
    ).toEqual([]);
    expect(
      messages(entry({ status: "checking", incidents: [incident] })),
    ).toEqual([]);
    expect(
      messages(entry({ status: "closed", ...counts, incidents: [incident] })),
    ).toEqual([]);
    for (const patch of [
      { status: "closed" },
      { status: "checking", ...counts },
      { status: "submitted", ...counts, incidents: [incident] },
      { status: "checking", accepted: 28, incidents: [incident] },
      {
        status: "checking",
        ...counts,
        incidents: [{ ...incident, kind: "fabricated_source" }],
      },
    ])
      expect(messages(entry(patch)), JSON.stringify(patch)).toEqual([
        "batches.0.accepted: accepted and cut are counted at close, and null before; a batch an invalid_check incident reopened keeps its last counts until it closes again",
      ]);
    // An invalid_check incident names its one checker, a checker's id.
    for (const checkers of [undefined, [], ["fc-fx-bravo", "fc-fx-alpha"]])
      expect(
        messages(entry({ incidents: [{ ...incident, checkers }] })),
        JSON.stringify(checkers),
      ).toEqual([
        "batches.0.incidents.0.checkers: an invalid_check incident names the one checker whose records were voided",
      ]);
    expect(
      entry({ incidents: [{ ...incident, checkers: ["w-fx-writer"] }] })
        .success,
    ).toBe(false);
  });

  it("counts retired items with accepted and cut, never alone and never in a list batch (CNT-2b)", () => {
    const register = fxRegister() as { batches: Record<string, unknown>[] };
    const entry = (index: number, patch: Record<string, unknown>) =>
      messages(
        BatchRegisterSchema.safeParse({
          batches: [{ ...register.batches[index], ...patch }],
        }),
      );
    expect(
      entry(0, { status: "closed", accepted: 27, cut: 7, retired: 1 }),
    ).toEqual([]);
    expect(entry(0, { retired: 1 })).toEqual([
      "batches.0.retired: retired is counted with accepted and cut, at close",
    ]);
    expect(
      entry(4, { status: "closed", accepted: 30, cut: 2, retired: 1 }),
    ).toEqual([
      "batches.0.retired: a list batch counts retired entities as cut",
    ]);
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
    const { batches: all } = BatchRegisterSchema.parse(
      readJson("content/batches.json"),
    );
    // Top-up batches (content:batch -- open --target) join the register later
    // with a bare plan of target and draft; the production plan is the rest.
    const isTopUp = (batch: (typeof all)[number]) =>
      Object.keys(batch.plan).every(
        (key) => key === "target" || key === "draft",
      );
    for (const batch of all.filter(isTopUp)) {
      expect(batch.status, batch.batchId).not.toBe("planned");
      expect(batch.writer, batch.batchId).toEqual(expect.any(String));
    }
    const batches = all.filter((batch) => !isTopUp(batch));
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
