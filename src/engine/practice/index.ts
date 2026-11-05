/**
 * Practice selection (ARCHITECTURE §4.8): plans for practice runs, their
 * bands and freshness, and the run config a plan becomes. Blitz and
 * Survival streams (`createPracticeStream`) join this module with BLZ-1.
 */
export {
  DEFAULT_PRACTICE_BANDS,
  DEFAULT_PRACTICE_RAMP,
  difficultyBandOf,
  rampBandAt,
} from "./bands.ts";
export { MAX_COMPARISONS, MAX_TRUE_FALSE, planPracticeRun } from "./plan.ts";
export {
  practiceJudgeContext,
  practiceRoundMetas,
  practiceRoundRng,
  practiceRunConfig,
  type PracticeRunConfigInput,
} from "./rounds.ts";
export {
  REPEAT_AFTER_DAYS,
  dayNumberOf,
  freshnessTier,
  type FreshnessTier,
} from "./seen.ts";
export type {
  DayNumber,
  PlanOptions,
  PracticeBands,
  PracticeMode,
  PracticeNote,
  PracticePlan,
  PracticeRamp,
  PracticeRequest,
  SeenIndex,
} from "./types.ts";
