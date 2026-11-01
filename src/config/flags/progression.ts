/**
 * Feature flag defaults for category mastery and achievements (PRD §3.4.4,
 * §3.4.5).
 *
 * Only MAS-1 edits this file: it turns the defaults on when the
 * feature ships. One file per owner, so tickets in the same wave never
 * edit the same lines (ARCHITECTURE §2.3, §12.1). `src/config/features.ts`
 * composes them.
 */
import type { FeatureFlag } from "../features";

export const PROGRESSION_FLAG_DEFAULTS = {
  mastery: false,
  achievements: false,
} as const satisfies Partial<Record<FeatureFlag, boolean>>;
