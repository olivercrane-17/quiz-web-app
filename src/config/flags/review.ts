/**
 * Feature flag default for Review my misses (PRD §3.3.7).
 *
 * Only REV-1 edits this file: it turns the defaults on when the
 * feature ships. One file per owner, so tickets in the same wave never
 * edit the same lines (ARCHITECTURE §2.3, §12.1). `src/config/features.ts`
 * composes them.
 */
import type { FeatureFlag } from "../features";

export const REVIEW_FLAG_DEFAULTS = {
  review: false,
} as const satisfies Partial<Record<FeatureFlag, boolean>>;
