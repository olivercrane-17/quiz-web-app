/**
 * Feature flag defaults for the calendar reminder and the install pitch
 * (PRD §3.4.6, §3.11.3).
 *
 * Only CAL-1 edits this file: it turns the defaults on when the
 * feature ships. One file per owner, so tickets in the same wave never
 * edit the same lines (ARCHITECTURE §2.3, §12.1). `src/config/features.ts`
 * composes them.
 */
import type { FeatureFlag } from "../features";

export const GROWTH_FLAG_DEFAULTS = {
  calendar: false,
  install_pitch: false,
} as const satisfies Partial<Record<FeatureFlag, boolean>>;
