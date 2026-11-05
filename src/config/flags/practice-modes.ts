/**
 * Feature flag defaults for Blitz and Survival (PRD §3.3.5, §3.3.6).
 *
 * Only BLZ-1 edits this file: it turns the defaults on when the
 * feature ships. One file per owner, so tickets in the same wave never
 * edit the same lines (ARCHITECTURE §2.3, §12.1). `src/config/features.ts`
 * composes them.
 */
import type { FeatureFlag } from "../features";

export const PRACTICE_MODE_FLAG_DEFAULTS = {
  blitz: false,
  survival: false,
} as const satisfies Partial<Record<FeatureFlag, boolean>>;
