/**
 * Feature flag defaults for the Beta features: host rooms and the quiz
 * editor (PRD §3.8, §3.9). They stay off until their gates pass (memo §9,
 * PRD §9.2), and only the orchestrator turns them on, at the gate.
 *
 * One file per owner, so tickets in the same wave never edit the same lines
 * (ARCHITECTURE §2.3, §12.1). `src/config/features.ts` composes them.
 */
import type { FeatureFlag } from "../features";

export const BETA_FLAG_DEFAULTS = {
  rooms: false,
  editor: false,
} as const satisfies Partial<Record<FeatureFlag, boolean>>;
