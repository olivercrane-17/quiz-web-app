/**
 * The verification record on every item (CONTENT_GUIDE §9.8) and the check
 * records that fact-checkers submit (§9.4, §9.5).
 *
 * Two shapes of claim result are accepted. The guide's: `evidence` is an
 * array of typed entries, a web entry names its `citedResult` (or null),
 * a checker's own addition carries `addedClaim`, and `packetSha256` holds
 * one hash per packet stage with `stagesServedAt` beside it. The older
 * shape, which every record accepted before the guide's settled: one
 * `evidence` entry with a `method` naming its kind, and one packet hash.
 * Both parse; the counting rules (`countedTier`, `isExternalSource`) are the
 * guide's for both.
 */
import { z } from "zod";

import { AddedClaimSchema, CLAIM_ID_PATTERN, additionPass } from "./claims.ts";
import {
  ANSWER_TYPES,
  agentId,
  isoDate,
  isoDateTime,
  sha256Hex,
  spareId,
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
/** The older shape's `method`: the kind of its one evidence entry. */
export const METHODS = ["dataset", "web", "knowledge", "calculation"] as const;
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
  // §9.4 step 4: every claim left uncertain gets one, naming it.
  "checker_doubt",
] as const;
export const ISSUE_SEVERITIES = ["blocker", "fix", "note"] as const;

/** Web result tiers (§9.5.2). Tier C never counts as evidence. */
export const TIERS = ["A", "B", "C"] as const;
export type Tier = (typeof TIERS)[number];

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

/** + The result a web summary attributes its sentence to (§9.5.2). */
export const CitedResultSchema = z.strictObject({
  title: z.string(),
  url,
  tier: z.enum(TIERS),
});

export const WebEvidenceSchema = z
  .strictObject({
    kind: z.literal("web"),
    query: text,
    results: z.array(z.strictObject({ title: z.string(), url })).min(1),
    summaryExcerpt: text,
    /**
     * + The named result the summary drew its sentence from, or null when
     * it names its sources only as a group or not at all (§9.5.2, §9.8).
     * Records from before the field leave it out, and count as null.
     */
    citedResult: CitedResultSchema.nullable().optional(),
    /** The tiers of the results the summary could have relied on. */
    tiers: z.array(z.enum(TIERS)).min(1),
    conflictReported: z.boolean(),
    retrievedAt: isoDate,
  })
  .superRefine((web, ctx) => {
    const cited = web.citedResult;
    if (!cited) return;
    if (!web.results.some((result) => result.url === cited.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["citedResult", "url"],
        message: "citedResult is one of the call's results (§9.5.2)",
      });
    }
    if (!web.tiers.includes(cited.tier)) {
      ctx.addIssue({
        code: "custom",
        path: ["citedResult", "tier"],
        message:
          "the cited result's tier is among the tiers the summary relied on",
      });
    }
  });
export type WebEvidence = z.infer<typeof WebEvidenceSchema>;

export const KnowledgeEvidenceSchema = z.strictObject({
  kind: z.literal("knowledge"),
  basis: z.enum(KNOWLEDGE_BASES),
  restatement: text,
  confidence: z.enum(KNOWLEDGE_CONFIDENCES),
});

/**
 * + A unit conversion, or arithmetic on other confirmed claims (§9.5.4):
 * the expression, its result, the constants it needs (names from
 * content/reference/units.json) and the claims it uses.
 */
export const CalculationEvidenceSchema = z.strictObject({
  kind: z.literal("calculation"),
  expression: text,
  result: z.number(),
  constants: z.array(text),
  claimIds: z.array(z.string().regex(CLAIM_ID_PATTERN)),
});

export const EvidenceSchema = z.discriminatedUnion("kind", [
  DatasetEvidenceSchema,
  WebEvidenceSchema,
  KnowledgeEvidenceSchema,
  CalculationEvidenceSchema,
]);
export type Evidence = z.infer<typeof EvidenceSchema>;

const TIER_RANK: Record<Tier, number> = { A: 0, B: 1, C: 2 };

/**
 * The tier one web call counts at (§9.5.2): its cited result's, or, when
 * the summary names no result, the lowest tier among the results it could
 * have relied on. A summary built from a Tier C page therefore never passes
 * just because a Tier A URL sits somewhere in the list.
 */
export function countedTier(web: {
  citedResult?: { tier: Tier } | null | undefined;
  tiers: readonly Tier[];
}): Tier {
  if (web.citedResult) return web.citedResult.tier;
  return web.tiers.reduce<Tier>(
    (lowest, tier) => (TIER_RANK[tier] > TIER_RANK[lowest] ? tier : lowest),
    "A",
  );
}

/** A web call that can confirm: it counts at Tier A or B and reports no conflict. */
export function webCallCounts(web: WebEvidence): boolean {
  return countedTier(web) !== "C" && !web.conflictReported;
}

/**
 * An independent external source (§9.5.2): a dataset record, or a web call
 * that counts. One call is one source however many URLs it lists.
 */
export function isExternalSource(entry: Evidence): boolean {
  return (
    entry.kind === "dataset" || (entry.kind === "web" && webCallCounts(entry))
  );
}

/**
 * Evidence that backs a high-risk claim (§9.2, §9.9 rule 3): an external
 * source, or a calculation for a pure conversion (§9.5.4).
 */
export function backsHighRisk(entry: Evidence): boolean {
  return isExternalSource(entry) || entry.kind === "calculation";
}

/** One entry that confirms on its own (§9.5): certain knowledge, a dataset, a counted web call or a calculation. */
export function entryConfirms(entry: Evidence): boolean {
  if (entry.kind === "knowledge") return entry.confidence === "certain";
  if (entry.kind === "web") return webCallCounts(entry);
  return true;
}

/** A claim result's evidence entries, in either shape. */
export function evidenceEntries(result: {
  evidence: Evidence | readonly Evidence[];
}): readonly Evidence[] {
  return Array.isArray(result.evidence)
    ? (result.evidence as readonly Evidence[])
    : [result.evidence as Evidence];
}

export const ClaimResultSchema = z
  .strictObject({
    claimId: z
      .string()
      .regex(CLAIM_ID_PATTERN, "claimId must be c1, xA1, xB1, ..."),
    verdict: z.enum(CLAIM_VERDICTS),
    /** The older shape: the kind of its one evidence entry. */
    method: z.enum(METHODS).optional(),
    /** The guide's array of typed entries (empty when the verdict rests on nothing), or the older shape's one entry. */
    evidence: z.union([EvidenceSchema, z.array(EvidenceSchema)]),
    note: z.string(),
    /** + A checker's own addition: the claim it added (§9.4 step 2, §9.8). */
    addedClaim: AddedClaimSchema.optional(),
  })
  .superRefine((result, ctx) => {
    const entries = evidenceEntries(result);
    const guideShape = Array.isArray(result.evidence);
    if (result.method !== undefined) {
      if (guideShape) {
        ctx.addIssue({
          code: "custom",
          path: ["method"],
          message:
            "method goes with one evidence entry; an evidence array names each entry's kind (§9.8)",
        });
      } else if (result.method !== entries[0]?.kind) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence", "kind"],
          message: `method is ${result.method} but the evidence is ${String(entries[0]?.kind)}`,
        });
      }
    }
    if (result.addedClaim !== undefined && result.claimId.startsWith("c")) {
      ctx.addIssue({
        code: "custom",
        path: ["addedClaim"],
        message:
          "addedClaim goes only on a checker's own addition (xA1, xB1, ...)",
      });
    }
    if (result.verdict !== "confirmed") return;
    const prefix = (index: number) =>
      guideShape ? ["evidence", index] : ["evidence"];
    entries.forEach((entry, index) => {
      if (entry.kind === "web" && entry.conflictReported) {
        ctx.addIssue({
          code: "custom",
          path: [...prefix(index), "conflictReported"],
          message: "a reported conflict fails the claim as written (§9.5.2)",
        });
      }
    });
    if (!guideShape) {
      // The older shape: its one entry is what confirms.
      const [entry] = entries;
      if (entry?.kind === "knowledge" && entry.confidence !== "certain") {
        ctx.addIssue({
          code: "custom",
          path: ["evidence", "confidence"],
          message: "only a certain knowledge check confirms a claim (§9.5.3)",
        });
      }
      if (entry?.kind === "web") {
        // A record from before citedResult existed keeps the rule it was
        // accepted under (a Tier A or B result in the list); it still
        // counts at its lowest tier wherever evidence is counted.
        const confirms =
          "citedResult" in entry
            ? countedTier(entry) !== "C"
            : entry.tiers.some((tier) => tier === "A" || tier === "B");
        if (!confirms) {
          ctx.addIssue({
            code: "custom",
            path: ["evidence", "tiers"],
            message:
              "a web call confirms only when it counts at Tier A or B: its cited result's tier, or the lowest tier it could have relied on (§9.5.2)",
          });
        }
      }
      return;
    }
    if (!entries.some(entryConfirms)) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message:
          "a confirmed claim needs an entry that confirms: certain knowledge, a dataset record, a web call that counts at Tier A or B (its cited result's tier, or the lowest it could have relied on), or a calculation (§9.5)",
      });
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
  /** + When the answer was recorded, before the next stage was served (§9.8). */
  recordedAt: isoDateTime.optional(),
});

/** Mystery: one entry per clue revealed, hardest first. */
export const MysteryColdSolveSchema = z.strictObject({
  perClue: z
    .array(
      z.strictObject({
        clue: z.int().min(1).max(4),
        guess: z.string().nullable(),
        candidates: z.array(z.string()),
        recordedAt: isoDateTime.optional(),
      }),
    )
    .min(1)
    .max(4),
});

export const EncoreColdSolveSchema = z.strictObject({
  estimate: z.number(),
  reasoning: text,
  recordedAt: isoDateTime.optional(),
});

export const ColdSolveSchema = z.union([
  ChoiceColdSolveSchema,
  MysteryColdSolveSchema,
  EncoreColdSolveSchema,
]);
export type ColdSolve = z.infer<typeof ColdSolveSchema>;

/**
 * When each stage's cold-solve entry was recorded, by stage: a mystery's
 * clue k at stage k, every other format's answer at stage 1. Entries
 * without a recordedAt are left out.
 */
export function coldSolveTimes(
  coldSolve: ColdSolve | null | undefined,
): Map<number, string> {
  const out = new Map<number, string>();
  if (!coldSolve) return out;
  if ("perClue" in coldSolve) {
    for (const entry of coldSolve.perClue)
      if (entry.recordedAt !== undefined) out.set(entry.clue, entry.recordedAt);
  } else if (coldSolve.recordedAt !== undefined) {
    out.set(1, coldSolve.recordedAt);
  }
  return out;
}

/** The CheckRecord fields (§9.8), shared by records, rechecks and inputs. */
export const checkRecordShape = {
  checker: agentId("fc"),
  /** + The model the run used, so an audit can confirm §0.2's model-family rule. */
  model: text.optional(),
  pass: z.enum(PASSES),
  brief: z.enum(BRIEFS),
  /**
   * One hash per packet stage served, in order (§9.4, §9.8), or the older
   * shape's one hash of the whole packet.
   */
  packetSha256: z.union([sha256Hex, z.array(sha256Hex).min(1)]),
  /** + When each packet stage was served, in the same order (§9.4, §9.8). */
  stagesServedAt: z.array(isoDateTime).min(1).optional(),
  startedAt: isoDateTime,
  finishedAt: isoDateTime,
  coldSolve: ColdSolveSchema,
  claimResults: z.array(ClaimResultSchema).min(1),
  issues: z.array(IssueSchema),
  searchesUsed: z.int().min(0),
  verdict: z.enum(RECORD_VERDICTS),
};

interface RecordLike extends VerdictLike {
  pass: Pass;
  brief: Brief;
}

interface VerdictLike {
  pass: string;
  packetSha256: string | readonly string[];
  stagesServedAt?: readonly string[] | undefined;
  startedAt: string;
  finishedAt: string;
  coldSolve: ColdSolve | null;
  claimResults: {
    claimId: string;
    verdict: string;
    evidence: unknown;
    addedClaim?: unknown;
  }[];
  issues: { severity: string }[];
  verdict: RecordVerdict;
}

/**
 * The staged packet (§9.4): one served time per stage hash, in order, and
 * each cold-solve entry recorded after its stage was served and before the
 * next one was. A cold-solve entry written after the next stage was served
 * makes the record invalid.
 */
function refineStages(record: VerdictLike, ctx: z.RefinementCtx): void {
  const served = record.stagesServedAt;
  // A record with one hash of the whole packet predates staging: its
  // stagesServedAt, if it has one, was never tied to the hash.
  if (served === undefined || !Array.isArray(record.packetSha256)) return;
  const hashes = record.packetSha256;
  if (hashes.length !== served.length) {
    ctx.addIssue({
      code: "custom",
      path: ["stagesServedAt"],
      message:
        "stagesServedAt holds one time per stage hash in packetSha256, in the same order (§9.8)",
    });
    return;
  }
  const times = served.map((at) => Date.parse(at));
  times.forEach((time, index) => {
    if (index > 0 && time < (times[index - 1] ?? time))
      ctx.addIssue({
        code: "custom",
        path: ["stagesServedAt", index],
        message: "stages are served in order",
      });
  });
  for (const [stage, at] of coldSolveTimes(record.coldSolve)) {
    const recorded = Date.parse(at);
    const servedAt = times[stage - 1];
    const next = times[stage];
    if (servedAt === undefined) continue;
    if (recorded < servedAt || (next !== undefined && recorded > next)) {
      ctx.addIssue({
        code: "custom",
        path: ["coldSolve"],
        message: `the stage ${stage} cold-solve entry must be recorded after stage ${stage} was served and before stage ${stage + 1} was (§9.4)`,
      });
    }
  }
}

/**
 * A checker's own additions, under its pass's prefix, say what they added
 * (§9.4 step 2): role, text and risk in `addedClaim`. Results in the older
 * one-entry shape predate the field.
 */
function refineAdditions(
  record: {
    pass: string;
    claimResults: {
      claimId: string;
      evidence: unknown;
      addedClaim?: unknown;
    }[];
  },
  ctx: z.RefinementCtx,
): void {
  // A follow-up verifies the claims it was sent; it adds none of its own.
  if ("followUpFor" in record) return;
  record.claimResults.forEach((result, index) => {
    if (
      additionPass(result.claimId) === record.pass &&
      Array.isArray(result.evidence) &&
      result.addedClaim === undefined
    )
      ctx.addIssue({
        code: "custom",
        path: ["claimResults", index, "addedClaim"],
        message: `${result.claimId} is this check's addition: give its role, text and risk in addedClaim (§9.4 step 2)`,
      });
  });
}

/** The timing and verdict rules every record follows, whatever its pass. */
function refineVerdict(record: VerdictLike, ctx: z.RefinementCtx): void {
  if (Date.parse(record.finishedAt) < Date.parse(record.startedAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["finishedAt"],
      message: "finishedAt is before startedAt",
    });
  }
  refineStages(record, ctx);
  refineAdditions(record, ctx);
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
  refineVerdict(record, ctx);
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

/**
 * + A follow-up run (§9.7): a check under pass A's or B's brief, by a run
 * that is none of the claim's author, the writer or the editor, on the
 * claims only one check confirmed. Its verdict stands in for the missing
 * check on those claims.
 */
export const FollowUpRecordSchema = z
  .strictObject({
    ...checkRecordShape,
    followUpFor: z.array(z.string().regex(CLAIM_ID_PATTERN)).min(1),
    coldSolve: z.null(),
  })
  .superRefine((record, ctx) => {
    if (record.pass === "T") {
      ctx.addIssue({
        code: "custom",
        path: ["pass"],
        message: "a follow-up runs under pass A's or pass B's brief",
      });
    }
    refineCheckRecord(record, ctx);
  });
export type FollowUpRecord = z.infer<typeof FollowUpRecordSchema>;

/**
 * + Pass D (§9.9 rule 7): the re-check of a scheduled sealed item before
 * its Daily freezes, for one date (`forDate`) or for a spare set (null),
 * against the answer-list versions that ship then (`listVersions`).
 */
export const DailyCheckRecordSchema = z
  .strictObject({
    ...checkRecordShape,
    pass: z.literal("D"),
    brief: z.literal("daily"),
    coldSolve: ColdSolveSchema.nullable(),
    forDate: isoDate.nullable(),
    /** The spare set a null-date check cleared, when it names one. */
    spareId: spareId.optional(),
    listVersions: z.partialRecord(z.enum(ANSWER_TYPES), isoDate),
  })
  .superRefine(refineVerdict);
export type DailyCheckRecord = z.infer<typeof DailyCheckRecordSchema>;

/** + The editor's merge of the claim lists (§9.7, §9.8). */
export const MergeRecordSchema = z.strictObject({
  mergedAt: isoDateTime,
  editor: agentId("ed"),
  claims: z.array(
    z.strictObject({
      id: z.string().regex(CLAIM_ID_PATTERN),
      addedBy: z.enum(["writer", "A", "B", "T", "D"]),
    }),
  ),
  duplicates: z.array(
    z.strictObject({
      id: z.string().regex(CLAIM_ID_PATTERN),
      sameAs: z.string().regex(CLAIM_ID_PATTERN),
    }),
  ),
  sentToFollowUp: z.array(z.string().regex(CLAIM_ID_PATTERN)),
});

/** + Every change after acceptance (§9.8, §2.12). */
export const CorrectionSchema = z.strictObject({
  date: isoDate,
  change: text,
  reason: text,
  /** Indexes into `rechecks` or `followUps` that cleared the change. */
  rechecks: z.array(z.int().min(0)),
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
    /** + §9.7's merge, follow-ups and §9.9 rule 7's pass D records. */
    merge: MergeRecordSchema.optional(),
    followUps: z.array(FollowUpRecordSchema).optional(),
    dailyChecks: z.array(DailyCheckRecordSchema).optional(),
    corrections: z.array(CorrectionSchema).optional(),
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
