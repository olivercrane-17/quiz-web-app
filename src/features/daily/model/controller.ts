/**
 * The Daily controller (ARCHITECTURE §4.5): the run machine plus the
 * backend. Framework-free; the screen reads it through
 * `useSyncExternalStore` and sends it the player's intents.
 *
 * - **Start.** `sealed.start({ kind: 'today' })` returns the player's
 *   attempt with round 0 already open, so one tap reaches clue 1
 *   (AC-DLY-01). The controller builds the run from that snapshot with
 *   `resume`, never running createRun's own `open_round`: the snapshot
 *   already carries round 0. A finished attempt goes straight to its
 *   results (AC-DLY-06); a reload resumes at the same clue with the same
 *   wrong guesses, because all state lives on the server (AC-DLY-07). The
 *   start also says whether the player has never finished a Daily
 *   (`firstDaily`, for the first-Daily hints), and every snapshot carries
 *   the open round's server time so far, which the stopwatch adds
 *   (`timeOffset`, R1-06), and so does the judge's claim (R3-01).
 * - **One clock (R2-08, R3-01).** Every judge call reports the round's
 *   whole interval as the stopwatch counts it at the press (`claimedAtPress`,
 *   a retry included: the
 *   device's interval, time hidden included, plus a reload's offset), so
 *   the server records the header's value at the press unless its own bound
 *   beats it by more than the latency allowance. A verdict that resolves a
 *   round brings the round's recorded time (`recordedMsOf`), which takes the
 *   place of the device's measure and of the offset a reload left
 *   (`withRecordedTime`), and the finish's total, once the last verdict or
 *   the finish brings it, is what the stopwatch shows from Lock in on
 *   (`totalMs`): the header's reading at the press is the stop screen's
 *   time.
 * - **Commands.** `open_round` calls `beginRound`, `judge` calls `act` with
 *   the round's current step, `finish` uses the summary the last call
 *   returned or asks `finish()` (idempotent), `resync` reloads the
 *   snapshot after `stale` (another tab moved on), `announce` turns the
 *   plugin's announcement into copy, and `focus` is handed to the screen.
 * - **Retries.** The reducer schedules them (§4.5 invariant 4): 2, 5, 10,
 *   then 30 s for transport failures; Retry-After, else 1, 2, 4, 8 s, for
 *   `rate_limited`, to which the controller adds up to 30% jitter. Every
 *   retry re-sends the same idempotency key, so a guess never counts twice.
 *   A failed start and a failed resync retry on the same schedules. The
 *   player's Retry runs the next attempt at once. A refused start carries
 *   its notice (PRD §3.0.2, AC-IDN-04): silent for 5 s of rate limiting,
 *   then plain copy, then the Practice fallback from 30 s.
 * - **Failing for good.** A begin_round or finish that fails with an error
 *   no retry can mend (`not_found` after a reset, `auth_failed` after the
 *   identity changed) waits on the player's Retry, which starts over from
 *   the server as a reload does; so does a resync that can't be served.
 * - **Waits.** While a call is in flight the controller ticks the run every
 *   500 ms, so "Checking…" appears after 1.5 s (PRD §3.0.2); a slow
 *   begin_round or finish raises `slowOpen` at 1.5 s for the same copy.
 * - **Announcements.** The plugin's announcement in the round's own words
 *   (`mysteryAnnouncementText`, `encoreAnnouncementText`), so every
 *   controller that runs Mysteries and Encores speaks alike, with
 *   `labels.ts` for anything a round leaves unworded; a withdrawn round's
 *   own words instead of a verdict; and none for choice verdicts, which
 *   ChoiceRound speaks itself in step with its reveal. A solve's stamp
 *   follows decision D10, so the controller says whether the round showed
 *   a miss first (`mysteryMissed` over its last clue screen): a solve
 *   after a miss is "Got there.", never "Knew it.".
 */
import {
  backendError,
  type BrowserContextInfo,
  type GameBackend,
} from "@/backend";
import { TUNABLES } from "@/config/tunables";
import type { Clock } from "@/engine/clock";
import type { Announcement, PluginRegistry } from "@/engine/rounds";
import {
  CHECKING_AFTER_MS,
  FALLBACK_AFTER_MS,
  PLAIN_COPY_AFTER_MS,
  createRun,
  reduceRun,
  retryDelayMs,
  retryNotice,
  selectRunView,
  type RetryNotice,
  type RoundSlot,
  type RunCommand,
  type RunEvent,
  type RunState,
  type RunView,
} from "@/engine/run";
import type {
  AttemptId,
  AttemptSnapshot,
  BackendError,
  BackendErrorCode,
  CompositionId,
  DailyIdentity,
  EpochMs,
  FinishSummary,
  IdempotencyKey,
  Result,
  RoundIntent,
  RoundOpen,
  RunConfig,
  TimeZone,
} from "@/engine/types";
import {
  encoreAnnouncementText,
  mysteryAnnouncementText,
  mysteryMissed,
} from "@/features/rounds";

import { DAILY_SCREEN_COPY } from "../client-copy";
import {
  announcementText,
  claimedAtPress,
  withRecordedTime,
  type TimeOffset,
} from "./labels";

export type FocusTarget = Extract<RunCommand, { kind: "focus" }>["target"];

export type DailyStatus = "starting" | "playing" | "finished" | "failed";

/** Why the start hasn't succeeded yet, or why it gave up ('failed'). */
export interface StartProblem {
  code: BackendErrorCode;
  /** Failures in a row. */
  count: number;
  retrying: boolean;
  refId: string | null;
  /** The first refusal of this run of `code` refusals. */
  since: EpochMs;
  /** `rate_limited` only: whose limit refused it, which picks AC-IDN-04's copy. */
  scope: "ip" | "player" | "project" | null;
  /** The latest refusal's Retry-After. */
  retryAfterMs: number | null;
  /**
   * What the screen may say yet (PRD §3.0.2): a rate-limited start stays
   * `silent` for 5 s, then `plain`, then `fallback` (Practice) from 30 s, or
   * `action` at once for a wait past 60 s; any other refusal is `plain`.
   */
  notice: RetryNotice;
}

export interface DailySnapshot {
  status: DailyStatus;
  problem: StartProblem | null;
  /** The start has waited longer than 1.5 s: "Checking…". */
  slowStart: boolean;
  /** A begin_round or finish has waited longer than 1.5 s: "Checking…". */
  slowOpen: boolean;
  attemptId: AttemptId | null;
  daily: DailyIdentity | null;
  composition: CompositionId | null;
  /** The window's close turned the run into an unranked archive play (§8.7). */
  converted: boolean;
  run: RunState | null;
  view: RunView | null;
  /** The latest focus move the run asked for; `seq` changes each time. */
  focus: { target: FocusTarget; seq: number } | null;
  /** Another tab moved this Daily on, and the screen caught up. */
  movedOn: boolean;
  /**
   * The player has never finished a Daily, as the start said: the
   * first-Daily hints show (PRD §3.1.3 to §3.1.5), and the round context
   * carries it to the rounds.
   */
  firstDaily: boolean;
  /**
   * The time the open round had before this page loaded, as the latest
   * snapshot said (R1-06): the stopwatch adds it, the judge never reports it.
   */
  timeOffset: TimeOffset | null;
  /**
   * The finish's official total time, once the last verdict or the finish
   * has brought it (R2-08): the stopwatch shows it from Lock in on, so its
   * last reading is the stop screen's time. Null until then.
   */
  totalMs: number | null;
}

export interface StartContext {
  tz: TimeZone;
  browser: BrowserContextInfo;
  appVersion: string;
}

export interface DailyControllerDeps {
  /** The tab's backend, after the client boot. */
  backend(): Promise<GameBackend>;
  plugins: PluginRegistry;
  clock: Clock;
  /**
   * The server-corrected clock's now (ARCHITECTURE §4.3), which a resumed
   * round's offset uses to count the response's trip back. Without it the
   * offset counts from the snapshot's `serverTime`, a few ms short.
   */
  serverNow?(): EpochMs;
  /** Runs `callback` after `ms`; returns a cancel function. */
  schedule(callback: () => void, ms: number): () => void;
  /** [0, 1), for retry jitter. */
  random(): number;
  newKey(): IdempotencyKey;
  announce(message: string, politeness: "polite" | "assertive"): void;
  startContext(): StartContext;
  /** The run finished in this session (not a resumed finished attempt). */
  onFinished?(summary: FinishSummary, composition: CompositionId): void;
  /** The attempt is known: warm what its rounds need (the answer lists). */
  onAttempt?(snapshot: AttemptSnapshot): void;
}

export interface DailyController {
  getSnapshot(): DailySnapshot;
  subscribe(listener: () => void): () => void;
  /**
   * Starts today's Daily, or resumes it from the server after stop(): the
   * screen calls it on mount, and again when a hidden route shows (§10.2
   * rule 6). A call while running does nothing.
   */
  start(): void;
  /** Stops timers and drops answers still in flight; start() picks up again. */
  stop(): void;
  intent(intent: RoundIntent): void;
  continue(): void;
  /**
   * The player's Retry: the waiting call goes out now, with the same key; a
   * call that failed for good starts over from the server instead.
   */
  retry(): void;
  visibility(hidden: boolean): void;
}

/** How often a wait is ticked, so "Checking…" and retry notices appear on time. */
export const TICK_MS = 500;
/** Rate-limited retries without Retry-After wait up to this much longer. */
export const RATE_LIMIT_JITTER = 0.3;

/** The step a call names (§7.2): the clue number on a Mystery, else 1. */
function stepOf(open: RoundOpen | null): number {
  return open?.family === "mystery" ? open.clue : 1;
}

function configFor(snapshot: AttemptSnapshot): RunConfig {
  return {
    mode: snapshot.kind === "archive" ? "archive" : "daily",
    sealed: true,
    rounds: snapshot.rounds,
    endRule: { kind: "fixed" },
    timing: { kind: "stopwatch" },
    scoring: "sealed",
    seed: snapshot.attemptId,
    runId: snapshot.attemptId,
  };
}

const retryable = (error: BackendError) =>
  error.code === "rate_limited" || error.retryable;

/**
 * Whether the start says the player has never finished a Daily, for the
 * first-Daily hints (PRD §3.1.3 to §3.1.5). The flag rides beside the
 * snapshot's own fields until ARCHITECTURE §3.4 names it: the mock sends
 * it, and a backend that doesn't counts as false, so a returning player is
 * never shown the hints again.
 */
export function firstDailyOf(snapshot: AttemptSnapshot): boolean {
  return (
    (snapshot as AttemptSnapshot & { firstDaily?: unknown }).firstDaily === true
  );
}

/** The most a response's trip back can add to an offset: the server clock's own bound on a round trip. */
const MAX_TRIP_MS = 60_000;

/**
 * What the round open in a snapshot had on the server's clock before this
 * page loaded (R1-06): its interval so far, or, from a backend that doesn't
 * report one, the time since its current clue was issued, which can only
 * count short. Null with no round open.
 *
 * `serverNow` is the server-corrected clock (ARCHITECTURE §4.3) as the
 * response arrives. The device counts the resumed round from that moment,
 * so the time between the snapshot's `serverTime` and its arrival is added
 * here; without it the header restarted behind the server by the response's
 * trip back (RITE round 2 review, R2-01).
 */
export function timeOffsetOf(
  snapshot: AttemptSnapshot,
  serverNow: EpochMs | null = null,
): TimeOffset | null {
  const current = snapshot.current;
  if (current === null || current.open === null) return null;
  const trip =
    serverNow === null || !Number.isFinite(serverNow)
      ? 0
      : Math.min(Math.max(0, serverNow - snapshot.serverTime), MAX_TRIP_MS);
  const ms =
    (current.activeMs ??
      Math.max(0, snapshot.serverTime - current.open.issuedAt)) + trip;
  return ms > 0 ? { index: current.index, ms } : null;
}

/**
 * The recorded time an act() response carries with a verdict that resolved
 * its round (R2-08), or null: a verdict that leaves the round open carries
 * none, and neither does a backend that doesn't report it yet. The field
 * rides beside the response's own until ARCHITECTURE §7.2 names it, as
 * round_action's `active_ms` (SQL-4, SQL-5).
 */
export function recordedMsOf(response: object): number | null {
  const ms = (response as { activeMs?: unknown }).activeMs;
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** Choice verdicts, which ChoiceRound announces itself as its reveal shows. */
const SPOKEN_BY_ROUND: ReadonlySet<string> = new Set([
  "correct",
  "wrong_choice",
]);

/**
 * Whether the round showed a miss before its verdict (decision D10): a
 * wrong guess or a wrongly picked option on its last clue screen. A
 * resolving verdict leaves the slot's `open` at that screen.
 */
function historyOf(slot: RoundSlot | undefined): { missed: boolean } {
  const open = slot?.open ?? null;
  return { missed: open?.family === "mystery" && mysteryMissed(open) };
}

/**
 * A verdict in the words of the round that gave it (MYS-1's copy, the words
 * every controller that runs Mysteries and Encores uses); `labels.ts` words
 * anything the rounds leave to the screen. `history` picks a solve's stamp
 * (D10).
 */
function verdictText(
  announcement: Announcement,
  history: { missed: boolean },
): string {
  return (
    mysteryAnnouncementText(
      announcement,
      { optionsFromClue: TUNABLES.daily.optionsFromClue },
      history,
    ) ??
    encoreAnnouncementText(announcement) ??
    announcementText(announcement, history)
  );
}

/** Begin_round or finish failed with an error no retry mends (stale resyncs by itself). */
function failedForGood(run: RunState): boolean {
  return (
    (run.phase === "opening" || run.phase === "finishing") &&
    run.failing === null &&
    run.error !== null &&
    run.error.code !== "stale"
  );
}

export function createDailyController(
  deps: DailyControllerDeps,
): DailyController {
  const listeners = new Set<() => void>();
  /** Bumped by stop(): answers to calls made before it are dropped. */
  let generation = 0;
  /** Between start() and stop(). */
  let active = false;

  let status: DailyStatus = "starting";
  let problem: StartProblem | null = null;
  let slowStart = false;
  let slowOpen = false;
  let attemptId: AttemptId | null = null;
  let daily: DailyIdentity | null = null;
  let composition: CompositionId | null = null;
  let converted = false;
  let run: RunState | null = null;
  let focus: DailySnapshot["focus"] = null;
  let movedOn = false;
  let firstDaily = false;
  let timeOffset: TimeOffset | null = null;
  let totalMs: number | null = null;
  /** A FinishSummary that arrived before the Continue that asks for it (§4.5 invariant 6). */
  let earlySummary: FinishSummary | null = null;
  let resyncFailures = 0;

  let cancelStartRetry: (() => void) | null = null;
  let cancelSlowStart: (() => void) | null = null;
  let cancelNotice: (() => void) | null = null;
  let cancelSlowOpen: (() => void) | null = null;
  let cancelRetry: (() => void) | null = null;
  let cancelTick: (() => void) | null = null;
  let cancelResync: (() => void) | null = null;

  let snapshot: DailySnapshot = build();

  function build(): DailySnapshot {
    return {
      status,
      problem,
      slowStart,
      slowOpen,
      attemptId,
      daily,
      composition,
      converted,
      run,
      view: run === null ? null : selectRunView(run, deps.plugins),
      focus,
      movedOn,
      firstDaily,
      timeOffset,
      totalMs,
    };
  }

  function publish(): void {
    snapshot = build();
    for (const listener of [...listeners]) listener();
    syncTicker();
  }

  const now = (): EpochMs => deps.clock.now();
  const serverNow = (): EpochMs | null => deps.serverNow?.() ?? null;

  async function call<T>(
    fn: (backend: GameBackend) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    try {
      return await fn(await deps.backend());
    } catch {
      // A chunk that didn't load is a network failure as far as play goes.
      return { ok: false, error: backendError("unreachable") };
    }
  }

  // ----- the start ---------------------------------------------------------

  function clearStartTimers(): void {
    cancelStartRetry?.();
    cancelStartRetry = null;
    cancelSlowStart?.();
    cancelSlowStart = null;
    cancelNotice?.();
    cancelNotice = null;
  }

  function clearRunTimers(): void {
    cancelRetry?.();
    cancelTick?.();
    cancelResync?.();
    cancelSlowOpen?.();
    cancelRetry = cancelTick = cancelResync = cancelSlowOpen = null;
    slowOpen = false;
  }

  function noticeOf(current: StartProblem): RetryNotice {
    return current.retrying
      ? retryNotice(
          current.code === "rate_limited",
          now() - current.since,
          current.retryAfterMs,
        )
      : "plain";
  }

  /**
   * A rate-limited start earns its plain copy at 5 s and Practice at 30 s
   * (PRD §3.0.2), even when the next retry is further off than that.
   */
  function scheduleNotice(): void {
    cancelNotice?.();
    cancelNotice = null;
    const current = problem;
    if (current === null || current.code !== "rate_limited") return;
    if (!current.retrying) return;
    const waited = now() - current.since;
    const next = [PLAIN_COPY_AFTER_MS, FALLBACK_AFTER_MS].find(
      (at) => at > waited,
    );
    if (next === undefined) return;
    cancelNotice = deps.schedule(() => {
      cancelNotice = null;
      if (problem === null) return;
      problem = { ...problem, notice: noticeOf(problem) };
      publish();
      scheduleNotice();
    }, next - waited);
  }

  async function attemptStart(): Promise<void> {
    const gen = generation;
    clearStartTimers();
    slowStart = false;
    cancelSlowStart = deps.schedule(() => {
      cancelSlowStart = null;
      slowStart = true;
      publish();
    }, CHECKING_AFTER_MS);
    const result = await call((backend) =>
      backend.sealed.start({ kind: "today" }, deps.startContext()),
    );
    if (gen !== generation) return;
    cancelSlowStart?.();
    cancelSlowStart = null;
    slowStart = false;
    if (result.ok) {
      begin(result.value);
      return;
    }
    const error = result.error;
    const again = retryable(error);
    const next: StartProblem = {
      code: error.code,
      count: (problem?.count ?? 0) + 1,
      retrying: again,
      refId: error.refId,
      since:
        problem !== null && problem.code === error.code ? problem.since : now(),
      scope: error.limitScope ?? null,
      retryAfterMs: error.retryAfterMs,
      notice: "plain",
    };
    problem = { ...next, notice: noticeOf(next) };
    if (!again) {
      status = "failed";
      publish();
      return;
    }
    const limited = error.code === "rate_limited";
    let wait = retryDelayMs(
      limited ? "rate_limited" : "transport",
      problem.count,
      limited ? error.retryAfterMs : null,
    );
    if (limited && error.retryAfterMs === null) {
      wait += Math.round(wait * RATE_LIMIT_JITTER * deps.random());
    }
    cancelStartRetry = deps.schedule(() => {
      cancelStartRetry = null;
      void attemptStart();
    }, wait);
    scheduleNotice();
    publish();
  }

  function begin(attempt: AttemptSnapshot): void {
    attemptId = attempt.attemptId;
    daily = attempt.daily;
    composition = attempt.composition;
    converted = converted || attempt.kind === "archive";
    problem = null;
    firstDaily = firstDailyOf(attempt);
    timeOffset = timeOffsetOf(attempt, serverNow());
    totalMs = null;
    deps.onAttempt?.(attempt);
    if (attempt.status === "finished") {
      status = "finished";
      publish();
      return;
    }
    if (attempt.status === "abandoned") {
      // An abandoned attempt reopens from its archive tile (ARC-1).
      status = "failed";
      problem = givenUp("stale", null);
      publish();
      return;
    }
    // createRun's open_round(0) is never run: the snapshot carries round 0.
    run = createRun(configFor(attempt), now()).state;
    status = "playing";
    dispatch({ type: "resume", at: now(), snapshot: attempt });
  }

  /** A start problem no retry will mend: the screen shows it with Try again. */
  function givenUp(code: BackendErrorCode, refId: string | null): StartProblem {
    return {
      code,
      count: 1,
      retrying: false,
      refId,
      since: now(),
      scope: null,
      retryAfterMs: null,
      notice: "plain",
    };
  }

  /**
   * Starts over from the server, as a reload does: `start` returns the
   * attempt as it stands (or a new one after a reset), and the run resumes
   * from it. What a call made before this answers is dropped.
   */
  function restart(): void {
    generation += 1;
    clearStartTimers();
    clearRunTimers();
    status = "starting";
    problem = null;
    run = null;
    movedOn = false;
    earlySummary = null;
    totalMs = null;
    resyncFailures = 0;
    publish();
    void attemptStart();
  }

  // ----- the run -----------------------------------------------------------

  /**
   * Applies `event` to the run and carries out its commands. `settle` runs
   * after the reducer and before the screen hears of it, for what the
   * controller adds to the run's own state (a verdict's recorded time).
   */
  function dispatch(event: RunEvent, settle?: () => void): void {
    if (!active || run === null) return;
    let transition;
    try {
      transition = reduceRun(run, event, deps.plugins);
    } catch (error) {
      // A plugin that throws (a stub before its ticket builds it) is a bug,
      // not a state the player can recover from.
      console.error(
        `[daily] the run machine refused ${event.type}: ${(error as Error)?.message ?? String(error)}`,
      );
      status = "failed";
      problem = givenUp("internal", null);
      publish();
      return;
    }
    const before = run;
    run = transition.state;
    if (
      event.type === "failed" &&
      event.error.code === "offline" &&
      before.failing?.code !== "offline"
    ) {
      deps.announce(DAILY_SCREEN_COPY.lostConnection, "assertive");
    }
    for (const command of transition.commands) handle(command);
    settle?.();
    if (run.phase === "finished" && status === "playing") {
      status = "finished";
      if (event.type === "finished" && event.summary !== null) {
        deps.onFinished?.(event.summary, composition ?? "");
      }
    }
    publish();
  }

  function handle(command: RunCommand): void {
    switch (command.kind) {
      case "open_round":
        void openRound(command.index);
        return;
      case "judge":
        void judge(command);
        return;
      case "schedule_retry":
        scheduleRetry(command.afterMs);
        return;
      case "resync":
        void resync();
        return;
      case "finish":
        void finish();
        return;
      case "persist":
        // Sealed runs never persist locally (§4.5 invariant 8).
        return;
      case "announce": {
        const slot = run?.slots[run.index];
        // A round withdrawn mid-round resolves with the withdrawn reveal,
        // which the plugin can't word; the round's own line says why.
        const reveal = slot?.reveal ?? null;
        if (reveal?.family === "withdrawn") {
          deps.announce(
            DAILY_SCREEN_COPY.withdrawn[reveal.round],
            command.politeness,
          );
          return;
        }
        if (SPOKEN_BY_ROUND.has(command.announcement.kind)) return;
        deps.announce(
          verdictText(command.announcement, historyOf(slot)),
          command.politeness,
        );
        return;
      }
      case "focus":
        focus = { target: command.target, seq: (focus?.seq ?? 0) + 1 };
        return;
    }
  }

  function noteResponse(value: {
    finished: FinishSummary | null;
    converted: boolean;
  }): void {
    if (value.finished !== null) {
      earlySummary = value.finished;
      totalMs = value.finished.totalMs;
    }
    if (value.converted) converted = true;
  }

  /** "Checking…" once a begin_round or finish has waited 1.5 s (PRD §3.1.4, Loading clue). */
  function armSlowOpen(): void {
    cancelSlowOpen?.();
    slowOpen = false;
    cancelSlowOpen = deps.schedule(() => {
      cancelSlowOpen = null;
      slowOpen = true;
      publish();
    }, CHECKING_AFTER_MS);
  }

  function settleSlowOpen(): void {
    cancelSlowOpen?.();
    cancelSlowOpen = null;
    slowOpen = false;
  }

  async function openRound(index: number): Promise<void> {
    const gen = generation;
    const id = attemptId;
    if (id === null) return;
    armSlowOpen();
    const result = await call((backend) =>
      backend.sealed.beginRound(id, index),
    );
    if (gen !== generation) return;
    settleSlowOpen();
    if (!result.ok) {
      dispatch({ type: "failed", at: now(), key: null, error: result.error });
      return;
    }
    noteResponse(result.value);
    const start = result.value.start;
    dispatch(
      start.kind === "open"
        ? { type: "opened", at: now(), index, open: start.open }
        : {
            type: "withdrawn",
            at: now(),
            index,
            reveal: start.reveal,
            next: start.next,
          },
    );
  }

  async function judge(
    command: Extract<RunCommand, { kind: "judge" }>,
  ): Promise<void> {
    const gen = generation;
    const id = attemptId;
    if (id === null || run === null) return;
    const step = stepOf(run.slots[command.index]?.open ?? null);
    // The round's whole interval as the stopwatch counts it (R3-01): what
    // the header showed when the answer was sent is what the server records,
    // unless its own bound beats it by more than the latency allowance. A
    // retry claims the same press, not the retry's later moment.
    const claimed = claimedAtPress(run, command, timeOffset);
    const result = await call((backend) =>
      backend.sealed.act({
        attemptId: id,
        index: command.index,
        step,
        intent: command.intent,
        clientActiveMs: claimed,
        hiddenMs: Math.round(command.hiddenMs),
        key: command.key,
      }),
    );
    if (gen !== generation) return;
    if (!result.ok) {
      dispatch({
        type: "failed",
        at: now(),
        key: command.key,
        error: result.error,
      });
      return;
    }
    noteResponse(result.value);
    const recorded = recordedMsOf(result.value);
    dispatch(
      {
        type: "verdict",
        at: now(),
        key: command.key,
        verdict: result.value.verdict,
      },
      () => {
        // The server's figure for the round it just resolved, in place of
        // the device's and the reload's (R2-08); from a backend that reports
        // none, the claim this call sent, so the reveal still shows the
        // value from the press (R3-01). A verdict the run didn't take
        // (another key's) leaves the round open, and this unchanged.
        if (run === null) return;
        ({ state: run, offset: timeOffset } = withRecordedTime(
          run,
          timeOffset,
          command.index,
          recorded ?? claimed,
        ));
      },
    );
  }

  function scheduleRetry(afterMs: number | null): void {
    cancelRetry?.();
    let wait = afterMs ?? 0;
    const failing = run?.failing ?? null;
    if (failing?.code === "rate_limited" && failing.retryAfterMs === null) {
      wait += Math.round(wait * RATE_LIMIT_JITTER * deps.random());
    }
    cancelRetry = deps.schedule(() => {
      cancelRetry = null;
      dispatch({ type: "retry", at: now() });
    }, wait);
  }

  async function resync(): Promise<void> {
    const gen = generation;
    const id = attemptId;
    if (id === null) return;
    cancelResync?.();
    cancelResync = null;
    const result = await call((backend) => backend.sealed.get(id));
    if (gen !== generation) return;
    if (!result.ok) {
      const error = result.error;
      if (!retryable(error)) {
        status = "failed";
        problem = givenUp(error.code, error.refId);
        publish();
        return;
      }
      resyncFailures += 1;
      const limited = error.code === "rate_limited";
      cancelResync = deps.schedule(
        () => {
          cancelResync = null;
          void resync();
        },
        retryDelayMs(
          limited ? "rate_limited" : "transport",
          resyncFailures,
          limited ? error.retryAfterMs : null,
        ),
      );
      return;
    }
    resyncFailures = 0;
    movedOn = true;
    earlySummary = null;
    if (result.value.kind === "archive") converted = true;
    timeOffset = timeOffsetOf(result.value, serverNow());
    dispatch({ type: "resume", at: now(), snapshot: result.value });
  }

  async function finish(): Promise<void> {
    const gen = generation;
    const id = attemptId;
    if (id === null) return;
    const ready = earlySummary;
    if (ready !== null) {
      earlySummary = null;
      dispatch({ type: "finished", at: now(), summary: ready });
      return;
    }
    armSlowOpen();
    const result = await call((backend) => backend.sealed.finish(id));
    if (gen !== generation) return;
    settleSlowOpen();
    if (!result.ok) {
      dispatch({ type: "failed", at: now(), key: null, error: result.error });
      return;
    }
    totalMs = result.value.totalMs;
    dispatch({ type: "finished", at: now(), summary: result.value });
  }

  // ----- waits -------------------------------------------------------------

  function waiting(): boolean {
    if (run === null || status !== "playing") return false;
    if (run.phase === "judging") return true;
    if (run.phase !== "opening" && run.phase !== "finishing") return false;
    // A call that failed for good waits on the player's Retry, not on time.
    return !failedForGood(run) && run.error?.code !== "stale";
  }

  function syncTicker(): void {
    if (!active) return;
    if (waiting() && cancelTick === null) {
      cancelTick = deps.schedule(() => {
        cancelTick = null;
        dispatch({ type: "tick", at: now() });
      }, TICK_MS);
    } else if (!waiting() && cancelTick !== null) {
      cancelTick();
      cancelTick = null;
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (active) return;
      active = true;
      // From the top, or picking up after stop(): either way the server's
      // snapshot is the truth, and the run is rebuilt from it.
      if (status !== "finished") {
        problem = null;
        void attemptStart();
      }
    },
    stop() {
      if (!active) return;
      active = false;
      generation += 1;
      clearStartTimers();
      clearRunTimers();
      slowStart = false;
      earlySummary = null;
    },
    intent(intent) {
      dispatch({ type: "intent", at: now(), intent, key: deps.newKey() });
    },
    continue() {
      if (movedOn) movedOn = false;
      dispatch({ type: "continue", at: now() });
    },
    retry() {
      if (!active) return;
      if (status === "starting" && problem !== null) {
        void attemptStart();
        return;
      }
      // Nothing the same call could mend: start over from the server.
      if (status === "failed" || (run !== null && failedForGood(run))) {
        restart();
        return;
      }
      if (run?.failing != null) {
        cancelRetry?.();
        cancelRetry = null;
        dispatch({ type: "retry", at: now() });
        return;
      }
      if (cancelResync !== null) void resync();
    },
    visibility(hidden) {
      dispatch({ type: "visibility", at: now(), hidden });
    },
  };
}
