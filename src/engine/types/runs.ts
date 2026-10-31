/**
 * Runs and sealed attempts (ARCHITECTURE §3.4). The run machine's own types
 * (RunState, RunEvent, RunCommand) live next to the reducer in run/types.ts
 * (§4.5).
 */
import type { CompositionId, DailyIdentity } from "./daily.ts";
import type {
  AttemptId,
  ChallengeCode,
  DailyNumber,
  EpochMs,
  PackId,
  QuizShareCode,
} from "./ids.ts";
import type {
  EncoreError,
  ResolvedRound,
  RoundMeta,
  RoundOpen,
} from "./rounds.ts";

export type RunMode =
  /** Sealed, judged by the backend. */
  | "daily"
  | "archive"
  | "challenge"
  | "pack"
  | "quiz"
  /** Local, judged on the device. */
  | "practice"
  | "blitz"
  | "survival"
  | "review"
  | "quiz_solo";

export type EndRule =
  | { kind: "fixed" }
  | { kind: "strikes"; max: number }
  | { kind: "clock"; durationMs: number };
export type Timing =
  | { kind: "untimed" }
  | { kind: "stopwatch" }
  | { kind: "countdown"; durationMs: number };
/** Rooms are scored on the server (§4.6). */
export type ScoringPolicy = "sealed" | "practice" | "blitz";

export interface RunConfig {
  mode: RunMode;
  sealed: boolean;
  /** 'stream': Blitz and Survival append rounds as they go. */
  rounds: RoundMeta[] | "stream";
  endRule: EndRule;
  timing: Timing;
  scoring: ScoringPolicy;
  /** Practice selection and shuffles. */
  seed: string;
  /** The attempt id for sealed runs, a local UUID otherwise. */
  runId: string;
}

export type AttemptKind = "daily" | "archive" | "challenge" | "pack" | "quiz";
export type SealedSource =
  | { kind: "today" }
  | { kind: "archive"; dailyNumber: DailyNumber }
  | { kind: "challenge"; code: ChallengeCode }
  | { kind: "pack"; packId: PackId }
  | { kind: "quiz"; code: QuizShareCode };

export interface AttemptSnapshot {
  attemptId: AttemptId;
  kind: AttemptKind;
  ranked: boolean;
  daily: DailyIdentity | null;
  composition: CompositionId;
  rounds: RoundMeta[];
  maxPoints: number;
  resolved: ResolvedRound[];
  /** open null: Continue not tapped yet. */
  current: { index: number; open: RoundOpen | null } | null;
  status: "active" | "finished" | "abandoned";
  points: number;
  startedAt: EpochMs;
  serverTime: EpochMs;
}

/** PRD §3.1.6 item 2, in its priority order. */
export interface BestMomentFacts {
  perfect: boolean;
  /** True only with 3 or more earlier finishes. */
  newBestScore: boolean;
  /** The player's first finished Daily ever (also the day-1 milestone). */
  firstFinish: boolean;
  milestone: number | null;
  freezeEarned: boolean;
  hardestSolvedOnClue1: boolean;
  /** Mastery tiers are decided on the device. */
  bullseye: boolean;
  /** Gates the personal comparison (3 or more). */
  earlierFinishes: number;
}
export interface StreakDelta {
  before: number;
  after: number;
  freezesHeld: 0 | 1 | 2;
  freezeEarned: boolean;
  repaired: boolean;
  milestone: number | null;
  /**
   * While a repair is possible, the score card shows this pre-break count
   * as paused, never `after` (PRD §3.1.6 item 2).
   */
  paused: { streak: number; until: EpochMs } | null;
}
export interface FinishSummary {
  attemptId: AttemptId;
  points: number;
  maxPoints: number;
  encore: EncoreError | null;
  totalMs: number;
  ranked: boolean;
  streak: StreakDelta | null;
  facts: BestMomentFacts;
}
