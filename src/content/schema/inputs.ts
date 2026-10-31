/**
 * Files that agents hand to the CLI: checker records for
 * `content:record` and editor decisions for `content:decide`.
 */
import { z } from "zod";

import { agentId, isoDateTime, text } from "./primitives.ts";
import {
  EDITOR_DECISIONS,
  checkRecordShape,
  refineCheckRecord,
} from "./verification.ts";

/** One CheckRecord (§9.8) plus the item it is about. */
export const RecordInputEntrySchema = z
  .strictObject({ itemId: text, ...checkRecordShape })
  .superRefine(refineCheckRecord);
export type RecordInputEntry = z.infer<typeof RecordInputEntrySchema>;

export const RecordInputSchema = z.array(RecordInputEntrySchema).min(1);

/**
 * An editor decision. `accept` may edit only sourceLabels, tags, lintAllow
 * and reviewBy. A `rewrite` that changes anything a checker's packet shows
 * (KEY_FIELDS in the pipeline) clears the checks, because a changed claim
 * gets two fresh checks (§9.7), unless it is marked `wordingOnly`.
 */
export const DecisionInputEntrySchema = z.strictObject({
  itemId: text,
  editor: agentId("ed"),
  decision: z.enum(EDITOR_DECISIONS),
  reason: text,
  /** Top-level item fields to replace, such as stem or sourceLabels. */
  edits: z.record(z.string(), z.unknown()).optional(),
  /** The editor's call on a near-duplicate that dedupe flagged (§9.9). */
  dedupe: z.enum(["related_ok", "duplicate"]).optional(),
  /** Force two fresh checks even when no claim-bearing field changed. */
  recheck: z.boolean().optional(),
  /**
   * Rewrite only: the edits reword stem, question, explanation, learnMore,
   * measure, valueDisplay, unitShort or unitLabel without touching a claim,
   * so the checks are kept (§9.7). Their packetSha256 values are re-stamped
   * to the new packet, and the old values go into the editor's reason.
   */
  wordingOnly: z.boolean().optional(),
  decidedAt: isoDateTime.optional(),
});
export type DecisionInputEntry = z.infer<typeof DecisionInputEntrySchema>;

export const DecisionInputSchema = z.array(DecisionInputEntrySchema).min(1);
