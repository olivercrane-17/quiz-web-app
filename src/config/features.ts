/**
 * Feature flags and their defaults (ARCHITECTURE §10.5, D19). Flags are
 * build-time: NEXT_PUBLIC_FEATURES (parsed by PLT-1 in env-parse.ts) lists
 * the enabled ones, and unset means these defaults. `isFeatureEnabled(flag)`
 * in @/lib/env is the only reader. Beta route modules call notFound() when
 * their flag is off, so the value is fixed at build time (AC-ROM-13).
 *
 * This file never changes after CORE-0a. Each default lives in its owner's
 * file under `./flags/`, and the owner turns it on there when its feature
 * ships, so the Should tickets that run side by side in Waves 15 and 16
 * never edit the same lines (§2.3, §12.1):
 *
 *   flags/beta.ts            rooms, editor                 the orchestrator, at the Beta gate (memo §9)
 *   flags/practice-modes.ts  blitz, survival               BLZ-1
 *   flags/review.ts          review                        REV-1
 *   flags/progression.ts     mastery, achievements         MAS-1
 *   flags/growth.ts          calendar, install_pitch       CAL-1
 *   flags/categories.ts      category_pages, monthly_pack  CAT-1
 *   flags/sound.ts           read_aloud                    SND-1
 *   flags/display.ts         readable_text, high_contrast  SET-1
 *
 * Adaptive Mixed has no flag: the PRD moved it to Later.
 */
import { BETA_FLAG_DEFAULTS } from "./flags/beta";
import { CATEGORY_FLAG_DEFAULTS } from "./flags/categories";
import { DISPLAY_FLAG_DEFAULTS } from "./flags/display";
import { GROWTH_FLAG_DEFAULTS } from "./flags/growth";
import { PRACTICE_MODE_FLAG_DEFAULTS } from "./flags/practice-modes";
import { PROGRESSION_FLAG_DEFAULTS } from "./flags/progression";
import { REVIEW_FLAG_DEFAULTS } from "./flags/review";
import { SOUND_FLAG_DEFAULTS } from "./flags/sound";

export const FEATURE_FLAGS = [
  // Beta
  "rooms",
  "editor",
  // Should
  "blitz",
  "survival",
  "review",
  "mastery",
  "achievements",
  "calendar",
  "install_pitch",
  "category_pages",
  "monthly_pack",
  "read_aloud",
  "readable_text",
  "high_contrast",
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** Flags whose features ship with a visible "Beta" label (PRD §1.3). */
export const BETA_FLAGS: ReadonlySet<FeatureFlag> = new Set([
  "rooms",
  "editor",
]);

export const FEATURE_DEFAULTS: Readonly<Record<FeatureFlag, boolean>> =
  Object.freeze({
    ...BETA_FLAG_DEFAULTS,
    ...PRACTICE_MODE_FLAG_DEFAULTS,
    ...REVIEW_FLAG_DEFAULTS,
    ...PROGRESSION_FLAG_DEFAULTS,
    ...GROWTH_FLAG_DEFAULTS,
    ...CATEGORY_FLAG_DEFAULTS,
    ...SOUND_FLAG_DEFAULTS,
    ...DISPLAY_FLAG_DEFAULTS,
  } satisfies Record<FeatureFlag, boolean>);

export function isFeatureFlag(value: unknown): value is FeatureFlag {
  return (
    typeof value === "string" &&
    (FEATURE_FLAGS as readonly string[]).includes(value)
  );
}
