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
  // The rest of C26's risk floor (CONTENT_GUIDE §2.13): "only" in the
  // text, the key claim of a counterintuitive item, and a clue, value or
  // input claim in a sealed pool.
  "only",
  "counterintuitive",
  "sealed_pool",
] as const;
export type RiskReason = (typeof RISK_REASONS)[number];

/**
 * Writer claims are c1, c2, ... (§9.2). A checker's additions carry the
 * pass that made them, so two blind checkers never both write one id: xA1
 * from checker A, xB1 from B, xT1 from a tiebreak, xD1 from pass D. Plain
 * x1, x2, ... are the older form, which records accepted before the
 * prefixes keep.
 */
export const CLAIM_ID_PATTERN = /^(?:c|x[ABTD]?)[1-9][0-9]*$/;

/** The pass that added a claim, from its id, or null for c and plain x ids. */
export function additionPass(id: string): "A" | "B" | "T" | "D" | null {
  const match = /^x([ABTD])[1-9]/.exec(id);
  return match ? (match[1] as "A" | "B" | "T" | "D") : null;
}

const claimFields = {
  role: z.enum(CLAIM_ROLES),
  ref: text.optional(),
  risk: z.enum(RISK_LEVELS),
  riskReason: z.enum(RISK_REASONS).optional(),
  text,
};

function refineRisk(
  claim: { risk: string; riskReason?: string | undefined },
  ctx: z.RefinementCtx,
): void {
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
}

export const ClaimSchema = z
  .strictObject({
    id: z
      .string()
      .regex(
        CLAIM_ID_PATTERN,
        "claim ids are c1, c2, ... (xA1, xB1, xT1 or xD1 for checker additions)",
      ),
    ...claimFields,
  })
  .superRefine(refineRisk);
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * + The claim a checker added, on its own claim result (§9.4 step 2, §9.8):
 * `{ "role", "ref", "text", "risk", "riskReason" }`.
 */
export const AddedClaimSchema = z
  .strictObject(claimFields)
  .superRefine(refineRisk);
export type AddedClaim = z.infer<typeof AddedClaimSchema>;

/** `{ "rule": "C19", "text": "...", "reason": "..." }` (CONTENT_GUIDE §2.3). */
export const LintAllowSchema = z.strictObject({
  rule: z.string().regex(/^[CX][0-9]{2}$/, "rule is a lint id such as C19"),
  text,
  reason: text,
});
export type LintAllow = z.infer<typeof LintAllowSchema>;
