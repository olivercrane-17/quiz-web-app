/**
 * The Daily, its results and the archive (ARCHITECTURE §3.4).
 */
import type { AnswerType, DifficultyBand } from "./content.ts";
import type {
  AttemptId,
  ChallengeCode,
  DailyNumber,
  EpochMs,
  LocalDate,
} from "./ids.ts";
import type { EncoreError, RoundType, ShareCell } from "./rounds.ts";
import type { AttemptSnapshot, FinishSummary } from "./runs.ts";

/** "Daily #42 · Sunday 1 November" */
export interface DailyIdentity {
  dailyNumber: DailyNumber;
  date: LocalDate;
}
/** 'm3e1', 'c9e1' (§4.9). */
export type CompositionId = string;

export interface TodayRoundChip {
  type: RoundType;
  difficulty: DifficultyBand | null;
  answerType: AnswerType | null;
}

export interface DailyTodayCard {
  daily: DailyIdentity;
  /** The home card's chips; answer types are public from clue 1 anyway. */
  rounds: TodayRoundChip[];
  /** Finished ranked runs so far today; null below 50 (a fixed PRD §3.1.7 rule, not percentile_min_n). */
  playedCount: number | null;
  status: "not_started" | "in_progress" | "finished";
  attemptId: AttemptId | null;
  progress: { roundIndex: number; of: number } | null;
  finished: {
    points: number;
    maxPoints: number;
    rows: ShareCell[][];
    encore: EncoreError | null;
  } | null;
  /** The start of the day after the effective today, in the request's zone (AC-STK-07). */
  nextUnlockAt: EpochMs;
  serverTime: EpochMs;
}

export type PercentileView =
  | {
      status: "ready";
      percentile: number;
      pool: number;
      scope: "band" | "all";
      final: boolean;
    }
  | { status: "cold_start"; finishers: number }
  | { status: "unranked"; wouldHaveBeaten: number | null; windowOpen: boolean };

/** index = points */
export interface ScoreHistogram {
  counts: number[];
  mine: number | null;
  pool: number;
}

export interface DailyResults {
  /** Status 'finished', every round resolved. */
  attempt: AttemptSnapshot;
  summary: FinishSummary;
  percentile: PercentileView;
  /** null below percentile_min_n eligible finishers. */
  histogram: ScoreHistogram | null;
  /** From 3 earlier finishes. */
  personal: { average: number; best: number; earlierFinishes: number } | null;
  /** Set when a challenge run landed here (§10.1). */
  challenge: { code: ChallengeCode } | null;
}

export type ArchiveTileState =
  "played" | "not_played" | "repair_available" | "repair_used" | "abandoned";
export interface ArchiveTile {
  daily: DailyIdentity;
  state: ArchiveTileState;
  result: { points: number; maxPoints: number; rows: ShareCell[][] } | null;
  repairUntil: EpochMs | null;
  nextRepairAt: EpochMs | null;
}
/** T-1 to T-7, newest first. */
export interface ArchiveListing {
  today: LocalDate;
  tiles: ArchiveTile[];
}
