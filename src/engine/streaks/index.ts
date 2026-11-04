/**
 * Streaks, freezes, repair and time zones in the engine (ARCHITECTURE §4.11,
 * PRD §4.4, decisions memo §14.1).
 */
export {
  dailyCredit,
  effectiveToday,
  lastCreditedDate,
  nextDailyAt,
  sameZone,
  type DailyCredit,
  type DailyCreditInput,
} from "./credit.ts";
export { datelineAllowed, evaluateStreak } from "./evaluate.ts";
export { applyFinish, finishOutcome, type FinishOutcome } from "./finish.ts";
export {
  EMPTY_LEDGER,
  finishLedger,
  readLedger,
  type LedgerFinish,
  type LedgerFinishRequest,
  type LedgerRead,
  type StreakLedger,
  type StreakRequest,
} from "./ledger.ts";
export {
  chainCount,
  isRepairable,
  repairCapUntil,
  repairDeadline,
  summarizeStreak,
  type StreakSummaryInput,
} from "./summary.ts";
export {
  DATELINE_COOLDOWN_DAYS,
  DATELINE_MIN_GROWTH_MINUTES,
  FINISHES_PER_FREEZE,
  MAX_FREEZES,
  REPAIR_COOLDOWN_MS,
  REPAIR_WINDOW_DAYS,
  type DatelineCandidate,
  type FinishKind,
  type GapStatus,
  type IncidentWindow,
  type StoredDay,
  type StoredStatus,
  type StreakCounters,
  type StreakDisplay,
  type StreakEvaluation,
  type StreakFinish,
  type StreakInput,
  type StreakSummary,
} from "./types.ts";
export { ZONE_LINKS, canonicalZone } from "./zone-links.ts";
