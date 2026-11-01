/**
 * Feature flag defaults for the category pages and the monthly pack
 * (PRD §3.17).
 *
 * Only CAT-1 edits this file: it turns the defaults on when the
 * feature ships. One file per owner, so tickets in the same wave never
 * edit the same lines (ARCHITECTURE §2.3, §12.1). `src/config/features.ts`
 * composes them.
 */
import type { FeatureFlag } from "../features";

export const CATEGORY_FLAG_DEFAULTS = {
  category_pages: false,
  monthly_pack: false,
} as const satisfies Partial<Record<FeatureFlag, boolean>>;
