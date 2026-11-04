/**
 * The audit record (CONTENT_GUIDE §9.10, ARCHITECTURE §5.1.1): one sealed
 * file per seeded blind audit, `audits/<id>.json`, committed only as
 * `content/sealed/audits/<id>.json.enc` because it lists sealed ids. It
 * holds the audit's id and date; the auditor's and the planter's ids and
 * models; every sampled item's id with the auditor's verdict; each planted
 * item's opaque packet id, defect type and subtlety, and whether the auditor
 * caught it, never its text; the counts; and each confirmed real error with
 * links to its re-checks. PRD AC-CNT-05 and release criterion R4 read the
 * counts (`auditCriteria`), which the content-sealed job checks.
 *
 * `scripts/content/audit.ts` draws, plants, packs and records an audit; this
 * schema is the record's contract.
 */
import { z } from "zod";

import { agentId, isoDate, text } from "./primitives.ts";

/** `audit-<yyyy-mm-dd>`, with an optional suffix for a second audit that day. */
export const AUDIT_ID_PATTERN = /^audit-\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)*$/;

/** Opaque packet ids: the auditor sees these and nothing that tells a real item from a plant. */
export const PACKET_ID_PATTERN = /^pk-[0-9a-z]{8}$/;

/** Planters (§0.2): `pl-` and the run id. The primitives' agent roles predate them. */
export const planterId = z
  .string()
  .regex(
    /^pl-[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
    "must be a planter id starting with pl-",
  );

/** The defects §9.10 names. The first six are the subtle ones. */
export const SUBTLE_DEFECTS = [
  "date_off",
  "number_off",
  "misattributed_quotation",
  "folk_etymology",
  "changed_since_2019",
  "regional_second_answer",
] as const;
export const BLATANT_DEFECTS = [
  "wrong_key",
  "ambiguous_stem",
  "right_distractor",
  "invented_source",
] as const;
export const DEFECT_TYPES = [
  ...SUBTLE_DEFECTS,
  ...BLATANT_DEFECTS,
  "other",
] as const;
export type DefectType = (typeof DEFECT_TYPES)[number];

export const AUDIT_STATUSES = ["drawn", "packed", "audited", "closed"] as const;

/** The pre-launch audit's floors (§9.10, PRD AC-CNT-05). */
export const AUDIT_FLOORS = {
  practice: 400,
  daily: 60,
  planted: 25,
  /** Caught at least 24 of 25, or 96% when more are planted. */
  caughtShare: 0.96,
} as const;

const count = z.int().min(0);

const SampleEntrySchema = z.strictObject({
  packetId: z.string().regex(PACKET_ID_PATTERN, "an opaque packet id"),
  /** A real item: a practice item, or a sealed Daily item (mystery or encore). */
  itemId: text,
  pool: z.enum(["practice", "daily"]),
  /** The auditor's verdict; `pending` until the verdicts are recorded. */
  verdict: z.enum(["pending", "pass", "fail"]),
  /** What the auditor found, for a fail. */
  defect: text.optional(),
  /**
   * A failed real item goes to a fresh re-check: `confirmed` makes it a
   * confirmed error (listed in `confirmedErrors`), `cleared` means the
   * re-check found the item right.
   */
  resolution: z.enum(["confirmed", "cleared"]).optional(),
});

const PlantSchema = z.strictObject({
  packetId: z.string().regex(PACKET_ID_PATTERN, "an opaque packet id"),
  defect: z.enum(DEFECT_TYPES),
  subtle: z.boolean(),
  /** Null until the verdicts are in; true when the auditor failed it. */
  caught: z.boolean().nullable(),
});

const ConfirmedErrorSchema = z.strictObject({
  itemId: text,
  defect: text,
  /** Where the re-checks that confirmed it live (§9.10), such as "verification.rechecks[0]". */
  rechecks: z.array(text).min(1),
  /** The batch that goes back for a full re-check (PRD §9.1, R4). */
  batchId: text.optional(),
});

export const AuditRecordSchema = z
  .strictObject({
    id: z.string().regex(AUDIT_ID_PATTERN, "audit ids are audit-<yyyy-mm-dd>"),
    date: isoDate,
    /** The draw's seed: the same seed and bank draw the same sample. */
    seed: z.int().min(0),
    /** `prelaunch` (AC-CNT-05), `monthly`, or `rerun` after a confirmed error. */
    purpose: z.enum(["prelaunch", "monthly", "rerun"]),
    status: z.enum(AUDIT_STATUSES),
    auditor: z.strictObject({ id: agentId("au"), model: text }),
    planter: z.strictObject({ id: planterId, model: text }),
    sample: z.array(SampleEntrySchema),
    plants: z.array(PlantSchema),
    counts: z.strictObject({
      practice: count,
      daily: count,
      planted: count,
      subtle: count,
      caught: count,
      flagged: count,
      confirmedErrors: count,
    }),
    confirmedErrors: z.array(ConfirmedErrorSchema),
    note: text.optional(),
  })
  .superRefine((record, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (!record.id.startsWith(`audit-${record.date}`))
      add(["id"], "the id carries the audit's date");
    // Packet ids are opaque and unique across real items and plants alike.
    const seen = new Set<string>();
    [...record.sample, ...record.plants].forEach((entry, index) => {
      if (seen.has(entry.packetId))
        add(
          ["sample", index, "packetId"],
          `duplicate packet id ${entry.packetId}`,
        );
      seen.add(entry.packetId);
    });
    const items = new Set<string>();
    record.sample.forEach((entry, index) => {
      if (items.has(entry.itemId))
        add(["sample", index, "itemId"], `${entry.itemId} is sampled twice`);
      items.add(entry.itemId);
      if (entry.resolution !== undefined && entry.verdict !== "fail")
        add(
          ["sample", index, "resolution"],
          "only an item the auditor failed is re-checked",
        );
    });
    // The counts are the arrays', so nobody types them by hand.
    const expected = countsOf(record);
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      if (record.counts[key] !== expected[key])
        add(
          ["counts", key],
          `counts.${key} is ${String(record.counts[key])}; the record holds ${String(expected[key])}`,
        );
    }
    const confirmed = new Set(
      record.sample
        .filter((entry) => entry.resolution === "confirmed")
        .map((entry) => entry.itemId),
    );
    record.confirmedErrors.forEach((error, index) => {
      if (!confirmed.has(error.itemId))
        add(
          ["confirmedErrors", index, "itemId"],
          "a confirmed error is a sampled item whose re-check confirmed it",
        );
    });
    if (record.confirmedErrors.length !== confirmed.size)
      add(
        ["confirmedErrors"],
        "every confirmed item has its entry, with links to its re-checks",
      );
    if (record.status === "drawn" && record.plants.length > 0)
      add(["status"], "plants are added when the audit is packed");
    const pending = record.sample.some((entry) => entry.verdict === "pending");
    const uncaught = record.plants.some((plant) => plant.caught === null);
    if (
      (record.status === "audited" || record.status === "closed") &&
      (pending || uncaught)
    )
      add(["status"], "an audited record has a verdict on every packet");
    if (
      record.status === "closed" &&
      record.sample.some(
        (entry) => entry.verdict === "fail" && entry.resolution === undefined,
      )
    )
      add(
        ["status"],
        "an audit closes once every real item the auditor failed has been re-checked",
      );
  });
export type AuditRecord = z.infer<typeof AuditRecordSchema>;

/** The counts a record's arrays give. */
export function countsOf(
  record: Pick<AuditRecord, "sample" | "plants" | "confirmedErrors">,
): AuditRecord["counts"] {
  return {
    practice: record.sample.filter((entry) => entry.pool === "practice").length,
    daily: record.sample.filter((entry) => entry.pool === "daily").length,
    planted: record.plants.length,
    subtle: record.plants.filter((plant) => plant.subtle).length,
    caught: record.plants.filter((plant) => plant.caught === true).length,
    flagged: record.sample.filter((entry) => entry.verdict === "fail").length,
    confirmedErrors: record.confirmedErrors.length,
  };
}

/** The share caught a pass needs: 24 of 25, or 96% when more are planted. */
export function caughtNeeded(planted: number): number {
  return Math.ceil(planted * AUDIT_FLOORS.caughtShare - 1e-9);
}

/**
 * PRD AC-CNT-05 over one record: at least 400 practice items and 60 Daily
 * items sampled, at least 25 planted with at least half subtle, at least 24
 * of 25 caught (96% when more are planted), zero confirmed errors among the
 * real items, and the audit closed. Returns the criteria it misses.
 */
export function auditCriteria(record: AuditRecord): string[] {
  const counts = countsOf(record);
  const misses: string[] = [];
  if (counts.practice < AUDIT_FLOORS.practice)
    misses.push(
      `${counts.practice} practice items sampled; at least ${AUDIT_FLOORS.practice}`,
    );
  if (counts.daily < AUDIT_FLOORS.daily)
    misses.push(
      `${counts.daily} Daily items sampled; at least ${AUDIT_FLOORS.daily}`,
    );
  if (counts.planted < AUDIT_FLOORS.planted)
    misses.push(
      `${counts.planted} planted items; at least ${AUDIT_FLOORS.planted}`,
    );
  if (counts.subtle * 2 < counts.planted)
    misses.push(
      `${counts.subtle} of ${counts.planted} planted items are subtle; at least half`,
    );
  const needed = caughtNeeded(counts.planted);
  if (counts.caught < needed)
    misses.push(
      `${counts.caught} of ${counts.planted} planted items caught; at least ${needed}`,
    );
  if (counts.confirmedErrors > 0)
    misses.push(
      `${counts.confirmedErrors} confirmed error(s) among the real items; zero`,
    );
  if (record.status !== "closed")
    misses.push(`the audit is ${record.status}, not closed`);
  return misses;
}
