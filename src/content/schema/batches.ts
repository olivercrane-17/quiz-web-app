/**
 * The batch register, content/batches.json (CONTENT_GUIDE §11.3). The single
 * place batch numbers and item ids come from.
 *
 * One addition to §11.3: the status `planned`, with `writer: null`, for a
 * batch that is in the production plan but not opened yet. The editor opens
 * it (`npm run content:batch -- open`), which names the writer.
 *
 * The register's + fields of §11.3 are optional, because the editor and the
 * tools fill them as a batch moves (caps at opening, searches as records
 * arrive, the high-risk and evidence counts and the band, type and measured
 * counts at close), and each belongs to the pools §11.3 gives it.
 */
import { z } from "zod";

import {
  BATCH_ID_PATTERNS,
  agentId,
  answerType,
  categoryCode,
  isoDate,
  text,
} from "./primitives.ts";

export const BATCH_POOLS = [
  "practice",
  "mystery",
  "encore",
  "room",
  "list",
] as const;
export type BatchPool = (typeof BATCH_POOLS)[number];

export const BATCH_STATUSES = [
  "planned",
  "open",
  "submitted",
  "checking",
  "closed",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

const count = z.int().min(0);

/** Planned counts (§11.4). `target` is what the batch should land. */
export const BatchPlanSchema = z.strictObject({
  /** Accepted items (or list entries) the batch should land. */
  target: z.int().min(1),
  /** Items to draft: the target plus about 15% for cuts. */
  draft: z.int().min(1),
  /** Practice and rooms: bands of seededDifficulty; mysteries: slots 1 to 3. */
  difficulty: z
    .strictObject({ easy: count, medium: count, hard: count })
    .optional(),
  format: z
    .strictObject({ mc: count, tf: count, comparison: count })
    .optional(),
  categories: z.partialRecord(categoryCode, count).optional(),
  maxYearEncores: count.optional(),
  answerTypes: z.array(answerType).optional(),
  domain: text.optional(),
  note: text.optional(),
});
export type BatchPlan = z.infer<typeof BatchPlanSchema>;

export const IncidentSchema = z
  .strictObject({
    date: isoDate,
    kind: z.enum([
      "fabricated_source",
      "invalid_check",
      "audit_failure",
      "other",
    ]),
    note: text,
    /**
     * + fabricated_source: everyone who had checked an item of the batch when
     * the incident was recorded. Their checks were voided and none of them
     * may check the batch again: fresh checkers re-check every item (§9.6).
     *
     * + invalid_check: the one checker whose records were voided, on every
     * item of the batch, active ones included, because they were not real
     * checks (templated, say). That checker may not check the batch again: a
     * new checker run redoes the pass and the editor decides again.
     */
    checkers: z.array(agentId("fc")).optional(),
  })
  .superRefine((incident, ctx) => {
    if (incident.kind === "invalid_check" && incident.checkers?.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["checkers"],
        message:
          "an invalid_check incident names the one checker whose records were voided",
      });
    }
  });
export type Incident = z.infer<typeof IncidentSchema>;

/** WebSearch caps and use by role (§9.5.2): the writer, checkers A and B. */
const RoleCountsSchema = z.strictObject({
  writer: count,
  A: count,
  B: count,
});

/** Searches used: the three roles, plus tiebreaks and follow-ups (§11.3). */
const SearchesUsedSchema = z.strictObject({
  writer: count,
  A: count,
  B: count,
  T: count.optional(),
  followUps: count.optional(),
});

/** Something the owner approved for a batch (§11.3, §9.5.1). */
export const ApprovalSchema = z.strictObject({
  date: isoDate,
  /** What was approved, such as copying licensed data into a shipped file. */
  what: text,
  by: text,
});

export const BatchEntrySchema = z
  .strictObject({
    batchId: text,
    pool: z.enum(BATCH_POOLS),
    category: categoryCode.optional(),
    packId: text.optional(),
    answerType: answerType.optional(),
    writer: agentId("w", "lb").nullable(),
    status: z.enum(BATCH_STATUSES),
    plan: BatchPlanSchema,
    accepted: count.nullable(),
    cut: count.nullable(),
    lastSequence: z.int().min(0).max(99),
    /** + Set by the editor when the batch opens (§9.5.2). */
    searchCaps: RoleCountsSchema.optional(),
    /** + Summed from the check records, tiebreaks and follow-ups. */
    searchesUsed: SearchesUsedSchema.optional(),
    /** + High-risk claims in the accepted items' merged claim lists, at close. */
    highRiskClaims: count.optional(),
    /** + Of those, the claims with dataset, web or calculation evidence. */
    externallyEvidenced: count.optional(),
    /** + Practice and room batches, after estimation: accepted items per band by p. */
    bandCounts: z
      .strictObject({ easy: count, medium: count, hard: count })
      .optional(),
    /** + Mystery batches: accepted items per answer type. */
    typeCounts: z.partialRecord(answerType, count).optional(),
    /** + Encore batches: accepted encores with a length, area, mass or speed unit. */
    measuredEncores: count.optional(),
    /** + What the owner approved for this batch. */
    approvals: z.array(ApprovalSchema).optional(),
    incidents: z.array(IncidentSchema),
  })
  .superRefine((batch, ctx) => {
    const add = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const match = BATCH_ID_PATTERNS[batch.pool].exec(batch.batchId);
    if (!match) {
      add("batchId", `${batch.batchId} is not a ${batch.pool} batch id`);
      return;
    }
    const scope = match[1];
    if (batch.pool === "practice" || batch.pool === "mystery") {
      if (batch.category !== scope)
        add("category", `category must be ${String(scope)}`);
    } else if (batch.category !== undefined) {
      add("category", `${batch.pool} batches have no single category`);
    }
    if (batch.pool === "room") {
      if (batch.packId !== scope)
        add("packId", `packId must be ${String(scope)}`);
      if (batch.lastSequence > 89)
        add("lastSequence", "room sequences run 01 to 89");
    } else if (batch.packId !== undefined) {
      add("packId", "only room batches carry packId");
    }
    if (batch.pool === "list") {
      if (batch.answerType !== scope)
        add("answerType", `answerType must be ${String(scope)}`);
    } else if (batch.answerType !== undefined) {
      add("answerType", "only list batches carry answerType");
    }
    if (
      batch.status === "planned" ? batch.writer !== null : batch.writer === null
    ) {
      add("writer", "writer is null exactly while the batch is planned");
    }
    if (batch.writer !== null) {
      const role = batch.pool === "list" ? "lb-" : "w-";
      if (!batch.writer.startsWith(role))
        add("writer", `${batch.pool} batches are written by ${role} agents`);
    }
    // §11.3's + fields, each on the pools it describes.
    if (
      batch.bandCounts !== undefined &&
      batch.pool !== "practice" &&
      batch.pool !== "room"
    )
      add("bandCounts", "band counts are for practice and room batches");
    if (batch.typeCounts !== undefined && batch.pool !== "mystery")
      add("typeCounts", "type counts are for mystery batches");
    if (batch.measuredEncores !== undefined) {
      if (batch.pool !== "encore")
        add(
          "measuredEncores",
          "measured encores are counted in encore batches",
        );
      // One per ten encores (§6 rule 3): the guide's batches of ten take one.
      else if (
        batch.measuredEncores > Math.max(1, Math.floor(batch.plan.target / 10))
      )
        add(
          "measuredEncores",
          `at most one measured encore per ten in a batch (§6 rule 3); ${batch.batchId} plans ${batch.plan.target}`,
        );
    }
    if (
      (batch.highRiskClaims === undefined) !==
      (batch.externallyEvidenced === undefined)
    )
      add(
        "externallyEvidenced",
        "high-risk and externally evidenced claims are counted together",
      );
    if (
      batch.highRiskClaims !== undefined &&
      batch.externallyEvidenced !== undefined
    ) {
      if (batch.externallyEvidenced > batch.highRiskClaims)
        add("externallyEvidenced", "more evidenced claims than high-risk ones");
      else if (
        batch.status === "closed" &&
        batch.externallyEvidenced !== batch.highRiskClaims
      )
        add(
          "externallyEvidenced",
          "every high-risk claim carries external evidence before the batch closes (§11.3)",
        );
    }
    // Counted at close, and null before. A closed batch that an invalid_check
    // incident reopened is checking again but keeps its last counts until the
    // next close counts it afresh.
    const counted = batch.accepted !== null && batch.cut !== null;
    const uncounted = batch.accepted === null && batch.cut === null;
    const reopened =
      batch.status === "checking" &&
      batch.incidents.some((incident) => incident.kind === "invalid_check");
    if (
      batch.status === "closed"
        ? !counted
        : !(uncounted || (reopened && counted))
    ) {
      add(
        "accepted",
        "accepted and cut are counted at close, and null before; a batch an invalid_check incident reopened keeps its last counts until it closes again",
      );
    }
  });
export type BatchEntry = z.infer<typeof BatchEntrySchema>;

export const BatchRegisterSchema = z
  .strictObject({ batches: z.array(BatchEntrySchema) })
  .superRefine((register, ctx) => {
    const seen = new Set<string>();
    register.batches.forEach((batch, index) => {
      if (seen.has(batch.batchId)) {
        ctx.addIssue({
          code: "custom",
          path: ["batches", index, "batchId"],
          message: `duplicate batch ${batch.batchId}`,
        });
      }
      seen.add(batch.batchId);
    });
  });
export type BatchRegister = z.infer<typeof BatchRegisterSchema>;
