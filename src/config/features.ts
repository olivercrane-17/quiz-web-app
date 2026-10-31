/**
 * Feature flags and their defaults (ARCHITECTURE §10.5, D19). Flags are
 * build-time: NEXT_PUBLIC_FEATURES (parsed by PLT-1 in env-parse.ts) lists
 * the enabled ones, and unset means these defaults. `isFeatureEnabled(flag)`
 * in @/lib/env is the only reader. Beta route modules call notFound() when
 * their flag is off, so the value is fixed at build time (AC-ROM-13).
 *
 * `rooms` and `editor` stay off until their gates pass (memo §9). Each
 * Should feature's ticket turns its default on when the feature ships.
 * Adaptive Mixed has no flag: the PRD moved it to Later.
 */
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
    rooms: false,
    editor: false,
    blitz: false,
    survival: false,
    review: false,
    mastery: false,
    achievements: false,
    calendar: false,
    install_pitch: false,
    category_pages: false,
    monthly_pack: false,
    read_aloud: false,
    readable_text: false,
    high_contrast: false,
  });

export function isFeatureFlag(value: unknown): value is FeatureFlag {
  return (
    typeof value === "string" &&
    (FEATURE_FLAGS as readonly string[]).includes(value)
  );
}
