/**
 * Feature flag defaults for readable text and high-contrast feedback
 * (PRD §3.12). DS-1 builds their tokens; the Settings rows that expose them
 * come with SET-1.
 *
 * Only SET-1 edits this file: it turns the defaults on when the
 * feature ships. One file per owner, so tickets in the same wave never
 * edit the same lines (ARCHITECTURE §2.3, §12.1). `src/config/features.ts`
 * composes them.
 */
import type { FeatureFlag } from "../features";

export const DISPLAY_FLAG_DEFAULTS = {
  readable_text: false,
  high_contrast: false,
} as const satisfies Partial<Record<FeatureFlag, boolean>>;
