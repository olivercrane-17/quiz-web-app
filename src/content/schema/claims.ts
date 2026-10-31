/**
 * Claims (CONTENT_GUIDE §9.2) and editor-approved lint exceptions (§2.3).
 */
import { z } from "zod";

import { text } from "./primitives.ts";

export const CLAIM_ROLES = [
  "key",
  "distractor",
  "clue",
  "explanation",
  "uniqueness",
  "value",
  "input",
  "label",
] as const;
export type ClaimRole = (typeof CLAIM_ROLES)[number];

export const RISK_LEVELS = ["standard", "high"] as const;

export const RISK_REASONS = [
  "number",
  "date",
  "superlative",
  "first",
  "quotation",
  "etymology",
  "record",
  "recent_change",
  "checker_doubt",
] as const;
export type RiskReason = (typeof RISK_REASONS)[number];

/** Writer claims are c1, c2, ...; checker additions are x1, x2, ... */
export const CLAIM_ID_PATTERN = /^[cx][1-9][0-9]*$/;

export const ClaimSchema = z
  .strictObject({
    id: z
      .string()
      .regex(
        CLAIM_ID_PATTERN,
        "claim ids are c1, c2, ... (x1 for checker additions)",
      ),
    role: z.enum(CLAIM_ROLES),
    ref: text.optional(),
    risk: z.enum(RISK_LEVELS),
    riskReason: z.enum(RISK_REASONS).optional(),
    text,
  })
  .superRefine((claim, ctx) => {
    if (claim.risk === "high" && claim.riskReason === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["riskReason"],
        message: "a high-risk claim needs a riskReason",
      });
    }
    if (claim.risk === "standard" && claim.riskReason !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["riskReason"],
        message: "riskReason only goes on high-risk claims",
      });
    }
  });
export type Claim = z.infer<typeof ClaimSchema>;

/** `{ "rule": "C19", "text": "...", "reason": "..." }` (CONTENT_GUIDE §2.3). */
export const LintAllowSchema = z.strictObject({
  rule: z.string().regex(/^[CX][0-9]{2}$/, "rule is a lint id such as C19"),
  text,
  reason: text,
});
export type LintAllow = z.infer<typeof LintAllowSchema>;
