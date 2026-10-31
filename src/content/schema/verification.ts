/**
 * The verification record on every item (CONTENT_GUIDE §9.8) and the check
 * records that fact-checkers submit (§9.4, §9.5).
 */
import { z } from "zod";

import { CLAIM_ID_PATTERN } from "./claims.ts";
import {
  agentId,
  isoDate,
  isoDateTime,
  sha256Hex,
  text,
} from "./primitives.ts";

export const PASSES = ["A", "B", "T"] as const;
export type Pass = (typeof PASSES)[number];

export const BRIEFS = ["confirm", "refute", "tiebreak"] as const;
export type Brief = (typeof BRIEFS)[number];

/** Pass A confirms, pass B refutes, pass T breaks a tie (§9.4, §9.7). */
export const BRIEF_FOR_PASS: Record<Pass, Brief> = {
  A: "confirm",
  B: "refute",
  T: "tiebreak",
};

export const CLAIM_VERDICTS = ["confirmed", "refuted", "uncertain"] as const;
export const METHODS = ["dataset", "web", "knowledge"] as const;
export const RECORD_VERDICTS = ["pass", "revise", "fail"] as const;
export type RecordVerdict = (typeof RECORD_VERDICTS)[number];

export const ISSUE_TYPES = [
  "ambiguity",
  "second_answer",
  "outdated",
  "regional",
  "trick",
  "giveaway",
  "wording",
  "sensitivity",
  "style",
] as const;
export const ISSUE_SEVERITIES = ["blocker", "fix", "note"] as const;

/** Web result tiers (§9.5.2). Tier C never counts as evidence. */
export const TIERS = ["A", "B", "C"] as const;

/**
 * A knowledge check names its basis and a confidence. Only `certain`
 * confirms (§9.5.3).
 */
export const KNOWLEDGE_BASES = ["textbook", "reference", "everyday"] as const;
export const KNOWLEDGE_CONFIDENCES = ["certain", "likely", "unsure"] as const;

const url = z
  .string()
  .regex(
    /^https?:\/\/\S+$/,
    "must be an http(s) URL copied from a tool result",
  );

export const DatasetEvidenceSchema = z.strictObject({
  kind: z.literal("dataset"),
  /** A key in content/datasets/manifest.json. */
  dataset: text,
  /** The pinned commit or npm version from the manifest. */
  version: text,
  file: text,
  locator: text,
  excerpt: text,
  retrievedAt: isoDate,
});

export const WebEvidenceSchema = z.strictObject({
  kind: z.literal("web"),
  query: text,
  results: z.array(z.strictObject({ title: z.string(), url })).min(1),
  summaryExcerpt: text,
  tiers: z.array(z.enum(TIERS)).min(1),
  conflictReported: z.boolean(),
  retrievedAt: isoDate,
});

export const KnowledgeEvidenceSchema = z.strictObject({
  kind: z.literal("knowledge"),
  basis: z.enum(KNOWLEDGE_BASES),
  restatement: text,
  confidence: z.enum(KNOWLEDGE_CONFIDENCES),
});

export const EvidenceSchema = z.discriminatedUnion("kind", [
  DatasetEvidenceSchema,
  WebEvidenceSchema,
  KnowledgeEvidenceSchema,
]);
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ClaimResultSchema = z
  .strictObject({
    claimId: z.string().regex(CLAIM_ID_PATTERN, "claimId must be c1, x1, ..."),
    verdict: z.enum(CLAIM_VERDICTS),
    method: z.enum(METHODS),
    evidence: EvidenceSchema,
    note: z.string(),
  })
  .superRefine((result, ctx) => {
    const { evidence } = result;
    if (result.method !== evidence.kind) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence", "kind"],
        message: `method is ${result.method} but the evidence is ${evidence.kind}`,
      });
    }
    if (result.verdict !== "confirmed") return;
    if (evidence.kind === "knowledge" && evidence.confidence !== "certain") {
      ctx.addIssue({
        code: "custom",
        path: ["evidence", "confidence"],
        message: "only a certain knowledge check confirms a claim (§9.5.3)",
      });
    }
    if (evidence.kind === "web") {
      if (!evidence.tiers.some((tier) => tier === "A" || tier === "B")) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence", "tiers"],
          message:
            "a web check confirms only with a Tier A or B result (§9.5.2)",
        });
      }
      if (evidence.conflictReported) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence", "conflictReported"],
          message: "a reported conflict fails the claim as written (§9.5.2)",
        });
      }
    }
  });
export type ClaimResult = z.infer<typeof ClaimResultSchema>;

export const IssueSchema = z.strictObject({
  type: z.enum(ISSUE_TYPES),
  severity: z.enum(ISSUE_SEVERITIES),
  note: text,
});
export type Issue = z.infer<typeof IssueSchema>;

/** Multiple choice, true/false and comparison (and room questions). */
export const ChoiceColdSolveSchema = z.strictObject({
  answerGiven: text,
  confidence: z.enum(["low", "medium", "high"]),
  matchedKey: z.boolean(),
});

/** Mystery: one entry per clue revealed, hardest first. */
export const MysteryColdSolveSchema = z.strictObject({
  perClue: z
    .array(
      z.strictObject({
        clue: z.int().min(1).max(4),
        guess: z.string().nullable(),
        candidates: z.array(z.string()),
      }),
    )
    .min(1)
    .max(4),
});

export const EncoreColdSolveSchema = z.strictObject({
  estimate: z.number(),
  reasoning: text,
});

export const ColdSolveSchema = z.union([
  ChoiceColdSolveSchema,
  MysteryColdSolveSchema,
  EncoreColdSolveSchema,
]);
export type ColdSolve = z.infer<typeof ColdSolveSchema>;

/** The CheckRecord fields (§9.8), shared by records, rechecks and inputs. */
export const checkRecordShape = {
  checker: agentId("fc"),
  pass: z.enum(PASSES),
  brief: z.enum(BRIEFS),
  packetSha256: sha256Hex,
  startedAt: isoDateTime,
  finishedAt: isoDateTime,
  coldSolve: ColdSolveSchema,
  claimResults: z.array(ClaimResultSchema).min(1),
  issues: z.array(IssueSchema),
  searchesUsed: z.int().min(0),
  verdict: z.enum(RECORD_VERDICTS),
};

interface RecordLike {
  pass: Pass;
  brief: Brief;
  startedAt: string;
  finishedAt: string;
  claimResults: { claimId: string; verdict: string }[];
  issues: { severity: string }[];
  verdict: RecordVerdict;
}

/** The verdict definitions of §9.4, step 4, applied to one record. */
export function refineCheckRecord(
  record: RecordLike,
  ctx: z.RefinementCtx,
): void {
  if (BRIEF_FOR_PASS[record.pass] !== record.brief) {
    ctx.addIssue({
      code: "custom",
      path: ["brief"],
      message: `pass ${record.pass} has brief ${BRIEF_FOR_PASS[record.pass]}`,
    });
  }
  if (Date.parse(record.finishedAt) < Date.parse(record.startedAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["finishedAt"],
      message: "finishedAt is before startedAt",
    });
  }
  const seen = new Set<string>();
  record.claimResults.forEach((result, index) => {
    if (seen.has(result.claimId)) {
      ctx.addIssue({
        code: "custom",
        path: ["claimResults", index, "claimId"],
        message: `claim ${result.claimId} has two results`,
      });
    }
    seen.add(result.claimId);
  });
  const refuted = record.claimResults.some((r) => r.verdict === "refuted");
  const allConfirmed = record.claimResults.every(
    (r) => r.verdict === "confirmed",
  );
  const blocker = record.issues.some((issue) => issue.severity === "blocker");
  const fixable = record.issues.some((issue) => issue.severity === "fix");
  const expected: RecordVerdict =
    refuted || blocker ? "fail" : allConfirmed && !fixable ? "pass" : "revise";
  if (record.verdict !== expected) {
    const why =
      expected === "fail"
        ? "a claim is refuted or a blocker stands"
        : expected === "pass"
          ? "every claim is confirmed and no issue needs a fix"
          : "a claim is uncertain or an issue needs a fix";
    ctx.addIssue({
      code: "custom",
      path: ["verdict"],
      message: `verdict must be ${expected}: ${why} (§9.4)`,
    });
  }
}

export const CheckRecordSchema = z
  .strictObject(checkRecordShape)
  .superRefine(refineCheckRecord);
export type CheckRecord = z.infer<typeof CheckRecordSchema>;

export const RECHECK_TRIGGERS = ["report", "freshness", "audit"] as const;

/** A later report, freshness or audit re-check (§9.10). */
export const RecheckSchema = z
  .strictObject({ ...checkRecordShape, trigger: z.enum(RECHECK_TRIGGERS) })
  .superRefine(refineCheckRecord);

export const EDITOR_DECISIONS = ["accept", "rewrite", "cut"] as const;
export type EditorDecision = (typeof EDITOR_DECISIONS)[number];

export const EditorRecordSchema = z.strictObject({
  editor: agentId("ed"),
  decision: z.enum(EDITOR_DECISIONS),
  reason: text,
  decidedAt: isoDateTime,
});

export const DEDUPE_VERDICTS = ["unique", "related_ok", "duplicate"] as const;

/**
 * The dedupe call (§9.8). A plaintext item whose nearest neighbour is sealed
 * records `nearestId: "sealed"` and `score: null`, so no public file names a
 * sealed id or how close it is (ARCHITECTURE §5.4).
 */
export const SEALED_NEAREST = "sealed";

export const DedupeRecordSchema = z
  .strictObject({
    checkedAt: isoDateTime,
    nearestId: z.string().nullable(),
    score: z.number().min(0).max(1).nullable(),
    verdict: z.enum(DEDUPE_VERDICTS),
  })
  .superRefine((record, ctx) => {
    if ((record.nearestId === SEALED_NEAREST) !== (record.score === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["score"],
        message: `score is null exactly when nearestId is "${SEALED_NEAREST}"`,
      });
    }
  });

/** One claim that resembles an entry of content/reference/myths.json. */
export const MythHitSchema = z.strictObject({
  claimId: z.string(),
  mythId: z.string(),
  /**
   * True once both checks confirmed the claim and at least one confirming
   * result (A, B or T) is dataset or web evidence: two agents agreeing from
   * knowledge is weak evidence against a famous myth (§9.1).
   */
  cleared: z.boolean(),
});

export const MythsScreenSchema = z.strictObject({
  checkedAt: isoDateTime,
  hits: z.array(MythHitSchema),
});

/**
 * The lint at acceptance. A warning passes only with an editor's lintAllow
 * (ARCHITECTURE §5.2), so `warnings` lists the findings the item's lintAllow
 * waived when it was accepted.
 */
export const LintRecordSchema = z.strictObject({
  version: text,
  passed: z.boolean(),
  warnings: z.array(
    z.strictObject({ rule: z.string(), path: z.string(), message: z.string() }),
  ),
});

/**
 * + Every estimator run that wrote `predicted` on the item (content:estimate
 * keeps the history), so "one run holds one role" can be checked against
 * checkers and editors (§0.2). `predicted.estimator` names the method version.
 */
export const EstimateRecordSchema = z.strictObject({
  by: agentId("es"),
  at: isoDateTime,
});

export const VerificationSchema = z
  .strictObject({
    /** Passes A and B, at most one of each. */
    checks: z.array(CheckRecordSchema).max(2),
    tiebreak: CheckRecordSchema.nullable().optional(),
    editor: EditorRecordSchema.optional(),
    dedupe: DedupeRecordSchema.optional(),
    mythsScreen: MythsScreenSchema.optional(),
    lint: LintRecordSchema.optional(),
    rechecks: z.array(RecheckSchema).optional(),
    estimates: z.array(EstimateRecordSchema).optional(),
  })
  .superRefine((verification, ctx) => {
    const passes = verification.checks.map((check) => check.pass);
    passes.forEach((pass, index) => {
      if (pass === "T") {
        ctx.addIssue({
          code: "custom",
          path: ["checks", index, "pass"],
          message: "pass T belongs in tiebreak, not in checks",
        });
      } else if (passes.indexOf(pass) !== index) {
        ctx.addIssue({
          code: "custom",
          path: ["checks", index, "pass"],
          message: `two pass ${pass} records`,
        });
      }
    });
    const tiebreak = verification.tiebreak;
    if (tiebreak && tiebreak.pass !== "T") {
      ctx.addIssue({
        code: "custom",
        path: ["tiebreak", "pass"],
        message: "the tiebreak record must be pass T",
      });
    }
  });
export type Verification = z.infer<typeof VerificationSchema>;
