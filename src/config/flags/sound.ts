/**
 * Feature flag default for read aloud (PRD §3.12).
 *
 * Only SND-1 edits this file: it turns the defaults on when the
 * feature ships. One file per owner, so tickets in the same wave never
 * edit the same lines (ARCHITECTURE §2.3, §12.1). `src/config/features.ts`
 * composes them.
 */
import type { FeatureFlag } from "../features";

export const SOUND_FLAG_DEFAULTS = {
  read_aloud: false,
} as const satisfies Partial<Record<FeatureFlag, boolean>>;
