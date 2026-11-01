/**
 * The practice controller (ARCHITECTURE §4.5, PRD §3.3.1): one local run at
 * a time, judged on the device. Framework-free; the run screen reads it
 * through `useSyncExternalStore`, and it lives in module scope, so a run
 * screen that Next keeps mounted while hidden (`<Activity>`) shows the same
 * run when it comes back (§10.2 rule 6).
 *
 * It interprets the run machine's commands:
 * - `open_round`: plans nothing new; the choice plugin opens the round's
 *   item with the round's fork of the run seed, so a reopened round shows
 *   the same option order (§4.2).
 * - `judge`: the plugin's judge half, at once, but the verdict reaches the
 *   run only when the 400 ms suspense beat after the answer is over
 *   (`deps.beat`, PRD §3.0.3, DESIGN §7.3). Until then the run stays
 *   `judging`, so the header's segment and counts, the saved run and the
 *   round's reveal all change together, at 400 ms. The verdict keeps the
 *   time it was judged, so the beat never counts as answer time.
 * - `persist`: saves `qz:runs:<runId>` (invariant 8), so a reload resumes.
 * - `finish`: the run goes to `qz:history` and its snapshot is removed.
 * - `announce` and `focus`: ChoiceRound speaks its own verdict and moves
 *   focus inside itself, in step with what it shows, so these are no-ops.
 *
 * `begin(intent)` is the run screen's mount: a fresh request (Quick play,
 * Play again) starts a new run; with none, the run in memory carries on, or
 * this tab's unfinished run resumes (`deps.tab`, so two tabs never swap
 * runs), or failing that the newest unfinished run on the device, or Quick
 * play starts.
 */
import type { Clock } from "@/engine/clock";
import { compositionIdOf } from "@/engine/composition";
import {
  planPracticeRun,
  practiceJudgeContext,
  practiceRunConfig,
  type PlanOptions,
  type PracticeNote,
  type SeenIndex,
} from "@/engine/practice";
import { choicePlugin, type ChoiceJudge } from "@/engine/rounds/choice";
import {
  createRun,
  reduceRun,
  selectRunView,
  toLocalSnapshot,
  type RunCommand,
  type RunEvent,
  type RunState,
  type RunView,
} from "@/engine/run";
import type { LoadError, LoadResult } from "@/content/types";
import {
  parseIdempotencyKey,
  type CategoryId,
  type ItemId,
  type LocalDate,
  type OptionView,
  type PracticeItem,
  type RoundIntent,
} from "@/engine/types";
import type { Kv } from "@/platform/storage";

import type { PracticeIntent } from "../intent";
import { QUICK_PLAY_INTENT } from "../intent";
import { PRACTICE_PLUGINS } from "./plugins";
import {
  appendHistory,
  newestStoredRun,
  pruneRuns,
  readStoredRun,
  removeRun,
  saveRun,
  type PracticeHistoryEntry,
  type PracticeRunRequest,
  type StoredPracticeRun,
} from "./storage";

/** A practice run is ten questions (PRD §3.3.1). */
export const PRACTICE_RUN_LENGTH = 10;

export type PracticeStatus =
  /** Nothing asked yet (the server render, before the mount). */
  | "idle"
  /** Packs loading, or a stored run being checked. */
  | "loading"
  | "playing"
  | "finished"
  /** The packs couldn't be had: `error` says why. */
  | "failed"
  /** The filter holds nothing to play, even with repeats. */
  | "empty"
  /** A short Hard filter ran out before any repeat: offer Hard Mixed (AC-PRA-14). */
  | "exhausted";

/** A question's verdict for the progress segments; null until it resolves. */
export type PracticeMark = "right" | "wrong" | null;

export interface PracticeState {
  status: PracticeStatus;
  request: PracticeRunRequest | null;
  error: LoadError | null;
  runId: string | null;
  /** The run's items in round order. */
  items: readonly PracticeItem[];
  notes: readonly PracticeNote[];
  /** One per question, in round order. */
  marks: readonly PracticeMark[];
  view: RunView | null;
}

export interface PracticeEvents {
  /** A new run's first question is on its way (not a resume). */
  started(request: PracticeRunRequest): void;
  /** A run finished and is in the history. */
  finished(entry: PracticeHistoryEntry, composition: string): void;
}

export interface PracticeControllerDeps {
  clock: Clock;
  kv: Kv;
  loadPool(
    category: CategoryId | "mixed",
  ): Promise<LoadResult<readonly PracticeItem[]>>;
  /** A version 4 UUID: run ids (which seed the run) and idempotency keys. */
  newId(): string;
  /** The device's local date, for freshness. */
  today(): LocalDate;
  /** Seen-tracking (PRA-2); empty until then. */
  seen(): SeenIndex;
  /** Pulled items (PRA-2); empty until then. */
  denylist(): ReadonlySet<ItemId>;
  /** The tunable bands (TUNABLES.practice). */
  plan?: PlanOptions;
  events?: Partial<PracticeEvents>;
  /**
   * The suspense beat: a verdict reaches the run `ms` after its answer
   * (TUNABLES.answers.revealMs). `schedule` runs a callback later and
   * returns its cancel (setTimeout in the browser). Without it, verdicts
   * land at once.
   */
  beat?: {
    ms: number;
    schedule(run: () => void, ms: number): () => void;
  };
  /**
   * The run this tab is playing (session storage, `qz:practice-run`), so a
   * reload resumes this tab's run and never another tab's.
   */
  tab?: TabRunStore;
}

/** Where a tab keeps the id of the run it is playing. */
export interface TabRunStore {
  runId(): string | null;
  setRunId(runId: string | null): void;
}

export interface PracticeController {
  getState(): PracticeState;
  subscribe(listener: () => void): () => void;
  begin(intent: PracticeIntent | null): Promise<void>;
  start(request: PracticeRunRequest): Promise<void>;
  /** After a failed load: the same request again. */
  retry(): Promise<void>;
  answer(intent: RoundIntent): void;
  continue(): void;
  visibility(hidden: boolean): void;
}

export const IDLE_PRACTICE_STATE: PracticeState = Object.freeze({
  status: "idle",
  request: null,
  error: null,
  runId: null,
  items: Object.freeze([]) as readonly PracticeItem[],
  notes: Object.freeze([]) as readonly PracticeNote[],
  marks: Object.freeze([]) as readonly PracticeMark[],
  view: null,
});

export function requestFromIntent(intent: PracticeIntent): PracticeRunRequest {
  return {
    mode: intent.mode,
    category: intent.category,
    difficulty: intent.difficulty,
    repeats: intent.repeats === true,
  };
}

export const QUICK_PLAY_REQUEST: PracticeRunRequest =
  requestFromIntent(QUICK_PLAY_INTENT);

interface ActiveRun {
  runId: string;
  request: PracticeRunRequest;
  items: readonly PracticeItem[];
  notes: readonly PracticeNote[];
  state: RunState;
  /** Judge state by round, for the rounds opened since this run was loaded. */
  judges: Map<number, ChoiceJudge>;
}

function isOver(state: RunState): boolean {
  return state.phase === "finished" || state.phase === "abandoned";
}

function sameOptions(a: readonly OptionView[], b: readonly OptionView[]) {
  return (
    a.length === b.length &&
    a.every((option, i) => option.label === b[i]?.label)
  );
}

export function createPracticeController(
  deps: PracticeControllerDeps,
): PracticeController {
  const listeners = new Set<() => void>();
  let current: PracticeState = IDLE_PRACTICE_STATE;
  let active: ActiveRun | null = null;
  /** Bumped by every start, so a load that comes back late changes nothing. */
  let generation = 0;
  const queue: [ActiveRun, RunCommand][] = [];
  let draining = false;
  /** The monotonic time of the latest answer, which starts the beat. */
  let answeredAt: number | null = null;
  /** Cancels the verdict held for the beat, if one is waiting. */
  let cancelHeld: (() => void) | null = null;

  const now = () => deps.clock.now();

  function dropHeld(): void {
    cancelHeld?.();
    cancelHeld = null;
  }

  function publish(next: PracticeState): void {
    current = next;
    for (const listener of listeners) listener();
  }

  function publishRun(run: ActiveRun): void {
    publish({
      status: run.state.phase === "finished" ? "finished" : "playing",
      request: run.request,
      error: null,
      runId: run.runId,
      items: run.items,
      notes: run.notes,
      marks: run.state.slots.map((slot) =>
        slot.outcome?.family === "choice"
          ? slot.outcome.correct
            ? "right"
            : "wrong"
          : null,
      ),
      view: selectRunView(run.state, PRACTICE_PLUGINS),
    });
  }

  function settle(
    status: Exclude<PracticeStatus, "playing" | "finished">,
    request: PracticeRunRequest | null,
    extra: Partial<Pick<PracticeState, "error" | "notes">> = {},
  ): void {
    active = null;
    dropHeld();
    publish({ ...IDLE_PRACTICE_STATE, status, request, ...extra });
  }

  function dispatch(run: ActiveRun, event: RunEvent): void {
    if (run !== active) return;
    const transition = reduceRun(run.state, event, PRACTICE_PLUGINS);
    if (transition.state !== run.state) {
      run.state = transition.state;
      publishRun(run);
    }
    for (const command of transition.commands) queue.push([run, command]);
    drain();
  }

  /** Commands run in order, after the transition that emitted them. */
  function drain(): void {
    if (draining) return;
    draining = true;
    try {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [run, command] = next;
        if (run === active) execute(run, command);
      }
    } finally {
      draining = false;
    }
  }

  function execute(run: ActiveRun, command: RunCommand): void {
    switch (command.kind) {
      case "open_round":
        openRound(run, command.index);
        return;
      case "judge":
        judge(run, command);
        return;
      case "persist":
        persist(run);
        return;
      case "finish":
        finish(run);
        return;
      case "schedule_retry":
        // Local judging never fails in transit; a retry goes straight back.
        dispatch(run, { type: "retry", at: now() });
        return;
      case "resync":
      case "announce":
      case "focus":
        return;
    }
  }

  function openRound(run: ActiveRun, index: number): void {
    const item = run.items[index];
    const slot = run.state.slots[index];
    if (item === undefined || slot === undefined) return;
    const at = now();
    const opened = choicePlugin.open(
      item,
      slot.meta,
      practiceJudgeContext(run.state.config.seed, index, at),
    );
    run.judges.set(index, opened.judge);
    dispatch(run, { type: "opened", at, index, open: opened.open });
  }

  function judge(
    run: ActiveRun,
    command: Extract<RunCommand, { kind: "judge" }>,
  ): void {
    const at = now();
    const item = run.items[command.index];
    const state = run.judges.get(command.index);
    const result =
      item === undefined ||
      state === undefined ||
      command.intent.family !== "choice"
        ? ({ ok: false, error: "invalid_input" } as const)
        : choicePlugin.judge(
            item,
            state,
            command.intent,
            practiceJudgeContext(run.state.config.seed, command.index, at),
          );
    if (!result.ok) {
      dispatch(run, {
        type: "failed",
        at,
        key: command.key,
        error: {
          code: result.error,
          retryable: false,
          retryAfterMs: null,
          refId: null,
        },
      });
      return;
    }
    run.judges.set(command.index, result.judge);
    const deliver = () => {
      cancelHeld = null;
      dispatch(run, {
        type: "verdict",
        // When it was judged, so the beat isn't answer time, but never
        // before an event the run has already seen (a page hidden meanwhile).
        at: Math.max(at, run.state.updatedAt),
        key: command.key,
        verdict: result.verdict,
      });
    };
    const elapsed =
      answeredAt === null ? 0 : deps.clock.monotonic() - answeredAt;
    const wait = deps.beat === undefined ? 0 : deps.beat.ms - elapsed;
    if (deps.beat === undefined || wait <= 0) {
      deliver();
      return;
    }
    dropHeld();
    // Whole milliseconds, rounded up: a timer never fires before the beat ends.
    cancelHeld = deps.beat.schedule(deliver, Math.ceil(wait));
  }

  function stored(run: ActiveRun): StoredPracticeRun {
    return {
      v: 1,
      request: run.request,
      itemIds: run.items.map((item) => item.id),
      notes: [...run.notes],
      snapshot: toLocalSnapshot(run.state),
      savedAt: now(),
    };
  }

  function persist(run: ActiveRun): void {
    // A finished run lives in the history; its snapshot is gone.
    if (isOver(run.state)) return;
    saveRun(deps.kv, stored(run));
  }

  /**
   * The pick as a source index, so the history outlives any one display
   * order. It goes by the label the round showed, which the saved run
   * keeps: a pack update between a reload and the finish may reorder or
   * reword a resolved item, and a pick that no longer matches is dropped
   * rather than misnamed.
   */
  function chosenSource(run: ActiveRun, index: number): number | null {
    const item = run.items[index];
    const slot = run.state.slots[index];
    const reveal = slot?.reveal;
    if (item === undefined || reveal?.family !== "choice") return null;
    if (reveal.chosenIndex === null) return null;
    const open = slot?.open?.family === "choice" ? slot.open : null;
    const label = open?.options.find(
      (option) => option.index === reveal.chosenIndex,
    )?.label;
    const source = label === undefined ? -1 : item.options.indexOf(label);
    return source >= 0 ? source : null;
  }

  function historyEntry(run: ActiveRun, at: number): PracticeHistoryEntry {
    return {
      runId: run.runId,
      mode: "practice",
      request: run.request,
      score: run.state.score,
      maxPoints: run.state.slots.reduce((sum, s) => sum + s.meta.maxPoints, 0),
      startedAt: run.state.startedAt,
      finishedAt: at,
      questions: run.items.map((item, index) => {
        const outcome = run.state.slots[index]?.outcome;
        return {
          itemId: item.id,
          correct: outcome?.family === "choice" && outcome.correct,
          chosen: chosenSource(run, index),
        };
      }),
    };
  }

  function finish(run: ActiveRun): void {
    const at = now();
    const entry = historyEntry(run, at);
    appendHistory(deps.kv, entry);
    removeRun(deps.kv, run.runId);
    if (deps.tab?.runId() === run.runId) deps.tab.setRunId(null);
    deps.events?.finished?.(
      entry,
      compositionIdOf(run.items.map((item) => item.format)),
    );
    dispatch(run, { type: "finished", at, summary: null });
  }

  async function start(request: PracticeRunRequest): Promise<void> {
    generation += 1;
    const token = generation;
    settle("loading", request);
    const pool = await deps.loadPool(request.category);
    if (token !== generation) return;
    if (!pool.ok) {
      settle("failed", request, { error: pool.error });
      return;
    }
    const runId = deps.newId();
    const plan = planPracticeRun(
      pool.value,
      {
        mode: request.mode,
        category: request.category,
        difficulty: request.difficulty,
        length: PRACTICE_RUN_LENGTH,
        seed: runId,
        today: deps.today(),
        seen: deps.seen(),
        denylist: deps.denylist(),
        ability: null,
        repeats: request.repeats,
      },
      deps.plan,
    );
    if (plan.notes.includes("hard_exhausted")) {
      settle("exhausted", request, { notes: plan.notes });
      return;
    }
    if (plan.items.length === 0) {
      settle("empty", request, { notes: plan.notes });
      return;
    }
    const config = practiceRunConfig({
      runId,
      items: plan.items,
      bands: deps.plan?.bands,
    });
    const created = createRun(config, now());
    const run: ActiveRun = {
      runId,
      request,
      items: plan.items,
      notes: plan.notes,
      state: created.state,
      judges: new Map(),
    };
    active = run;
    deps.tab?.setRunId(runId);
    publishRun(run);
    deps.events?.started?.(request);
    for (const command of created.commands) queue.push([run, command]);
    drain();
    // The new run is saved with its first question; keep the newest three.
    pruneRuns(deps.kv);
  }

  /** Rebuilds a stored run against today's packs; false when it no longer fits them. */
  async function resume(
    saved: StoredPracticeRun,
    token: number,
  ): Promise<boolean> {
    const runId = saved.snapshot.config.runId;
    const pool = await deps.loadPool(saved.request.category);
    if (token !== generation) return true;
    if (!pool.ok) return false;
    const byId = new Map(pool.value.map((item) => [item.id, item]));
    const items: PracticeItem[] = [];
    for (const [index, id] of saved.itemIds.entries()) {
      const item = byId.get(id);
      const meta = saved.snapshot.slots[index]?.meta;
      // A pulled or reworked item ends the stored run.
      if (
        item === undefined ||
        meta === undefined ||
        item.format !== meta.type
      ) {
        removeRun(deps.kv, runId);
        return false;
      }
      items.push(item);
    }
    const at = now();
    const base = createRun(saved.snapshot.config, at).state;
    const resumed = reduceRun(
      base,
      { type: "resume", at, snapshot: saved.snapshot },
      PRACTICE_PLUGINS,
    );
    const run: ActiveRun = {
      runId,
      request: saved.request,
      items,
      notes: saved.notes,
      state: resumed.state,
      judges: new Map(),
    };
    // The open round's judge comes back from the seed; it must show what was saved.
    const index = resumed.state.index;
    const slot = resumed.state.slots[index];
    const item = items[index];
    if (
      slot?.open?.family === "choice" &&
      slot.outcome === null &&
      item !== undefined
    ) {
      const rebuilt = choicePlugin.open(
        item,
        slot.meta,
        practiceJudgeContext(
          saved.snapshot.config.seed,
          index,
          slot.open.issuedAt,
        ),
      );
      if (!sameOptions(rebuilt.open.options, slot.open.options)) {
        removeRun(deps.kv, runId);
        return false;
      }
      run.judges.set(index, rebuilt.judge);
    }
    active = run;
    deps.tab?.setRunId(runId);
    publishRun(run);
    for (const command of resumed.commands) queue.push([run, command]);
    drain();
    return true;
  }

  async function begin(intent: PracticeIntent | null): Promise<void> {
    if (intent !== null) {
      await start(requestFromIntent(intent));
      return;
    }
    if (current.status === "loading") return;
    if (active !== null && !isOver(active.state)) return;
    generation += 1;
    const token = generation;
    settle("loading", null);
    // This tab's own run first. Storage is shared by every tab, so the
    // newest run on the device may be another tab's; it is the fallback
    // only for a tab with no run of its own (a new tab, a cleared session).
    const mine = deps.tab?.runId() ?? null;
    const saved =
      (mine === null ? null : readStoredRun(deps.kv, mine)) ??
      newestStoredRun(deps.kv);
    if (saved !== null && (await resume(saved, token))) return;
    if (token !== generation) return;
    await start(QUICK_PLAY_REQUEST);
  }

  function withRun(make: (run: ActiveRun) => RunEvent): void {
    if (active !== null) dispatch(active, make(active));
  }

  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin,
    start,
    retry: () => start(current.request ?? QUICK_PLAY_REQUEST),
    answer(intent) {
      const key = parseIdempotencyKey(deps.newId());
      if (key === null) return;
      answeredAt = deps.clock.monotonic();
      withRun(() => ({ type: "intent", at: now(), intent, key }));
    },
    continue() {
      withRun(() => ({ type: "continue", at: now() }));
    },
    visibility(hidden) {
      withRun(() => ({ type: "visibility", at: now(), hidden }));
    },
  };
}
