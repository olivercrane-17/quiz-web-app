/**
 * Streaks and stats (ARCHITECTURE §3.5).
 */
import type { CategoryId } from "./content.ts";
import type { DailyIdentity } from "./daily.ts";
import type {
  AchievementId,
  DailyNumber,
  EpochMs,
  LocalDate,
  NoticeId,
} from "./ids.ts";
import type { EncoreError } from "./rounds.ts";

export type DayStatus =
  "played" | "repaired" | "freeze" | "protected" | "missed" | "today";

export type StreakNotice =
  | { id: NoticeId; kind: "freeze_spent"; date: LocalDate }
  | { id: NoticeId; kind: "protected"; date: LocalDate }
  | {
      id: NoticeId;
      kind: "rescored";
      dailyNumber: DailyNumber;
      round: number;
      points: number;
      maxPoints: number;
    }
  | {
      id: NoticeId;
      kind: "key_corrected";
      dailyNumber: DailyNumber;
      round: number;
      points: number;
      maxPoints: number;
    };

export interface RepairOffer {
  date: LocalDate;
  dailyNumber: DailyNumber;
  until: EpochMs;
}

export interface StreakState {
  current: number;
  best: number;
  /** Played and Repaired dates, ever. */
  daysPlayed: number;
  dailiesFinished: number;
  freezesHeld: 0 | 1 | 2;
  /** 0 to 6; stays 0 while 2 are held. */
  freezeProgress: number;
  /** Last 14 dates, oldest first. */
  strip: { date: LocalDate; status: DayStatus }[];
  repair: RepairOffer | null;
  /** The 168-hour cap. */
  repairBlockedUntil: EpochMs | null;
  /** PRD §4.4.3 step 6: what every surface shows. */
  display: "active" | "paused" | "broken";
  /**
   * While a repair is possible: the pre-break count and the repair
   * deadline; no surface then shows current (0).
   */
  paused: { streak: number; until: EpochMs } | null;
  /** Two or more uncovered dates in the break. */
  breakTooLong: boolean;
  /** Unseen one-time notices. */
  notices: StreakNotice[];
  /** The effective today (§8.7): never earlier than one already served. */
  today: LocalDate;
  evaluatedAt: EpochMs;
}

export interface PlayerServerStats {
  daysPlayed: number;
  dailiesFinished: number;
  averageScore: number | null;
  /** Last 30 played. */
  recent: { daily: DailyIdentity; points: number; maxPoints: number }[];
  /** index = points */
  scoreDistribution: number[];
  /** Clue 1 to 4, missed. */
  solvesByClue: readonly [number, number, number, number, number];
  encore: {
    bullseyes: number;
    closes: number;
    medianError: EncoreError | null;
  };
  dailyCategory: Partial<
    Record<
      CategoryId,
      { firstAttempts: number; correct: number; hardCorrect: number }
    >
  >;
  achievements: { id: AchievementId; unlockedAt: EpochMs }[];
  refreshedAt: EpochMs;
}
