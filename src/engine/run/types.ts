/**
 * The run state machine's types (ARCHITECTURE §4.5).
 *
 * One reducer drives every mode: the Daily, archive, challenges, packs,
 * shared quizzes, practice, Blitz, Survival, review and solo play of a
 * draft. It never awaits anything. Async work leaves as commands; results
 * come back as events stamped by the controller with clock.now().
 *
 * Beyond §4.5's fields, RunState carries four the reducer needs to keep its
 * invariants without hidden inputs: `updatedAt` (the latest event's time, so
 * the view can tell how long a wait has lasted), `hiddenAt` (the start of
 * the current hidden span, invariant 7), `pauseRequested` (an explicit
 * Blitz pause, which combines with a hidden page) and `failing` (the run of
 * failures of the operation in flight, for retry schedules and copy). The
 * `withdrawn` event is the one addition to RunEvent: begin_round answers a
 * voided round with a withdrawn reveal and no intent (§3.3 RoundStart).
 */
import type { BackendError, BackendErrorCode } from "../types/results.ts";
import type { EpochMs, IdempotencyKey } from "../types/ids.ts";
import type {
  RoundFamily,
  RoundIntent,
  RoundMeta,
  RoundOpen,
  RoundOutcome,
  RoundReveal,
  RoundVerdict,
} from "../types/rounds.ts";
import type {
  AttemptSnapshot,
  FinishSummary,
  RunConfig,
  RunMode,
} from "../types/runs.ts";
import type { Announcement, IntentError } from "../rounds/types.ts";

export type RunPhase =
  | "opening"
  | "active"
  | "judging"
  | "revealed"
  | "finishing"
  | "finished"
  | "abandoned";

export interface RoundSlot {
  meta: RoundMeta;
  open: RoundOpen | null;
  /** Plugin client state. */
  client: unknown;
  reveal: RoundReveal | null;
  outcome: RoundOutcome | null;
  openedAt: EpochMs | null;
  resolvedAt: EpochMs | null;
  /** begin_round plus each accepted state-changing action (§8.8). */
  requests: number;
  /** Client-measured active time. */
  activeMs: number;
  /** Time the page was hidden or the window blurred while a clue was open. */
  hiddenMs: number;
}

export interface PendingIntent {
  key: IdempotencyKey;
  intent: RoundIntent;
  /** When the intent was first sent. */
  sentAt: EpochMs;
  /** Sends so far, retries included. */
  tries: number;
}

export interface RunError {
  code: BackendErrorCode | IntentError;
  retryable: boolean;
}

/** Consecutive failures of the operation in flight. */
export interface FailingOperation {
  op: "open" | "judge" | "finish";
  /** The first failure of this run of failures. */
  since: EpochMs;
  count: number;
  code: BackendErrorCode;
  retryAfterMs: number | null;
}

export interface RunState {
  config: RunConfig;
  phase: RunPhase;
  index: number;
  slots: RoundSlot[];
  pending: PendingIntent | null;
  error: RunError | null;
  score: number;
  strikes: number;
  startedAt: EpochMs;
  /** Blitz: moves forward while paused. */
  countdownEndsAt: EpochMs | null;
  /** Blitz: tab hidden or read aloud speaking. */
  pausedAt: EpochMs | null;
  summary: FinishSummary | null;
  /** The time of the latest event the run has seen. */
  updatedAt: EpochMs;
  /** Since when the page has been hidden; null while it is visible. */
  hiddenAt: EpochMs | null;
  /** An explicit pause (the Blitz verdict flash, read aloud) is on. */
  pauseRequested: boolean;
  failing: FailingOperation | null;
}

/**
 * What a local run persists after every verdict, so a reload resumes
 * (invariant 8). Sealed runs never persist answers; they resume from
 * AttemptSnapshot.
 */
export interface LocalRunSnapshot {
  config: RunConfig;
  slots: RoundSlot[];
  score: number;
  strikes: number;
  startedAt: EpochMs;
  index: number;
}

export type RunEvent =
  /** meta: stream modes. */
  | {
      type: "opened";
      at: EpochMs;
      index: number;
      meta?: RoundMeta;
      open: RoundOpen;
    }
  /** begin_round answered a voided round: it resolves at once, unopened. */
  | {
      type: "withdrawn";
      at: EpochMs;
      index: number;
      reveal: Extract<RoundReveal, { family: "withdrawn" }>;
      next: RoundMeta | null;
    }
  | { type: "intent"; at: EpochMs; intent: RoundIntent; key: IdempotencyKey }
  | {
      type: "verdict";
      at: EpochMs;
      key: IdempotencyKey;
      verdict: RoundVerdict;
    }
  | {
      type: "failed";
      at: EpochMs;
      key: IdempotencyKey | null;
      error: BackendError;
    }
  | { type: "retry"; at: EpochMs }
  | { type: "continue"; at: EpochMs }
  /**
   * The answer to the `finish` command. Applies while finishing or opening,
   * never on a reveal: a summary that arrives early (the last act() returns
   * one) waits in the controller until the Continue emits `finish`.
   */
  | { type: "finished"; at: EpochMs; summary: FinishSummary | null }
  | { type: "tick"; at: EpochMs }
  | { type: "visibility"; at: EpochMs; hidden: boolean }
  | { type: "pause"; at: EpochMs; paused: boolean }
  | {
      type: "resume";
      at: EpochMs;
      snapshot: AttemptSnapshot | LocalRunSnapshot;
    }
  | { type: "abandon"; at: EpochMs };

export type RunCommand =
  /** sealed: backend.sealed.beginRound; local: plugin.open */
  | { kind: "open_round"; index: number }
  | {
      kind: "judge";
      index: number;
      intent: RoundIntent;
      key: IdempotencyKey;
      hiddenMs: number;
      activeMs: number;
    }
  /**
   * transport: 2, 5, 10, then 30 s; rate_limited: Retry-After, else 1, 2, 4,
   * 8 s with jitter, which the controller adds.
   */
  | { kind: "schedule_retry"; tries: number; afterMs: number | null }
  /** After 'stale': reload the snapshot. */
  | { kind: "resync" }
  /** sealed: backend.sealed.finish (idempotent); local: build the results. */
  | { kind: "finish" }
  /** Local runs: save LocalRunSnapshot. */
  | { kind: "persist" }
  | {
      kind: "announce";
      announcement: Announcement;
      politeness: "polite" | "assertive";
    }
  | {
      kind: "focus";
      target: "round_heading" | "clue_heading" | "reveal_heading";
    };

export interface Transition {
  state: RunState;
  commands: RunCommand[];
}

/** RoundComponentProps.status (§4.4.3); checking: judging past 1.5 s. */
export type RoundStatus =
  "idle" | "judging" | "checking" | "revealed" | "offline" | "error";

/**
 * Which copy a refusal deserves (PRD §3.0.2): silent retries first; plain
 * copy after 5 s; the action's own copy at once when the wait passes 60 s;
 * a feature's fallback only after 30 s.
 */
export type RetryNotice = "silent" | "plain" | "action" | "fallback";

/** The view model the round components and screens render (memo-friendly). */
export interface RunView {
  phase: RunPhase;
  mode: RunMode;
  sealed: boolean;
  index: number;
  /** Fixed runs: the round count; stream runs: null. */
  total: number | null;
  round: {
    meta: RoundMeta;
    family: RoundFamily;
    open: RoundOpen | null;
    client: unknown;
    reveal: RoundReveal | null;
    outcome: RoundOutcome | null;
  } | null;
  status: RoundStatus;
  error: RunError | null;
  retry: {
    op: FailingOperation["op"];
    code: BackendErrorCode;
    count: number;
    waitingMs: number;
    retryAfterMs: number | null;
    notice: RetryNotice;
  } | null;
  /** False while an intent is in flight (invariant 1) or no round is open. */
  inputEnabled: boolean;
  score: number;
  maxPoints: number;
  strikes: number;
  resolvedCount: number;
  /** The current round is the last of a fixed run: "See your results". */
  isLast: boolean;
  countdown: { remainingMs: number; paused: boolean } | null;
  summary: FinishSummary | null;
}
