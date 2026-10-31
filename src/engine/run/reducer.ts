/**
 * The run reducer (ARCHITECTURE §4.5).
 *
 *             createRun()
 *                 |
 *                 v
 *    +------> opening --opened--> active --intent (check ok)--> judging
 *    |           ^                  ^  |                          |   |
 *    |           |                  |  +--intent (check fails)    |   +--failed (retryable): stay judging,
 *    |           |                  |     stays active, error     |      schedule_retry; retry re-sends
 *    |           |                  |                             |      the same idempotency key
 *    |           |                  +------verdict 'continue'-----+
 *    |           |                                                |
 *    |      continue (more rounds, end rule not met)        verdict 'resolved'
 *    |           |                                                v
 *    +-----------+------------------------------------------- revealed
 *                                                                |
 *                          continue (last round or end rule met) |
 *                                                                v
 *                                          finishing --finished--> finished
 *    Any non-final phase --tick past countdown--> finishing (open round discarded, unscored, not seen)
 *    Any phase --resume(snapshot)--> rebuilt from the snapshot
 *    Local runs only --abandon--> abandoned
 *
 * Invariants (each one a unit test in reducer.test.ts):
 * 1. At most one intent is in flight; while `pending` is set, new intents
 *    are refused.
 * 2. A retry always re-sends the same idempotency key.
 * 3. A verdict whose key does not match `pending.key` is ignored.
 * 4. A non-retryable failure clears `pending` and returns to `active` with
 *    the error, except `stale`, which emits `resync`. `rate_limited` keeps
 *    `pending` and schedules a silent retry with the same key.
 * 5. Reading time never counts: activeMs accrues only between `opened` and
 *    the resolving verdict, and only while the page is visible.
 * 6. End rules: `fixed` finishes on the Continue after the last round;
 *    `strikes` on the Continue after the max-th wrong verdict; `clock` on
 *    the first tick at or after `countdownEndsAt`, discarding an unresolved
 *    round.
 * 7. A hidden span during `active` or `judging` adds to the round's
 *    hiddenMs; every judge command carries the running total. In Blitz a
 *    hidden page also pauses the countdown.
 * 8. Sealed runs never persist answers and resume from AttemptSnapshot;
 *    local runs persist LocalRunSnapshot after every verdict.
 *
 * The reducer is pure and total over well-formed events: an event that
 * doesn't apply to the current phase returns the same state object and no
 * commands, so a memoized view never re-renders for it.
 */
import { blitzPoints } from "../scoring/blitz.ts";
import type { EpochMs } from "../types/ids.ts";
import type { RoundMeta, RoundOutcome } from "../types/rounds.ts";
import type { AttemptSnapshot, RunConfig } from "../types/runs.ts";
import type { AnyRoundPlugin, PluginRegistry } from "../rounds/types.ts";
import { isWrongOutcome, outcomeFromReveal, outcomePoints } from "./outcome.ts";
import { retryDelayMs } from "./retry.ts";
import type {
  LocalRunSnapshot,
  RoundSlot,
  RunCommand,
  RunEvent,
  RunState,
  Transition,
} from "./types.ts";

type EventOf<T extends RunEvent["type"]> = Extract<RunEvent, { type: T }>;

function emptySlot(meta: RoundMeta): RoundSlot {
  return {
    meta,
    open: null,
    client: null,
    reveal: null,
    outcome: null,
    openedAt: null,
    resolvedAt: null,
    requests: 0,
    activeMs: 0,
    hiddenMs: 0,
  };
}

function countdownEnd(config: RunConfig, startedAt: EpochMs): EpochMs | null {
  return config.endRule.kind === "clock"
    ? startedAt + config.endRule.durationMs
    : null;
}

const same = (state: RunState): Transition => ({ state, commands: [] });

function persistFor(state: RunState): RunCommand[] {
  return state.config.sealed ? [] : [{ kind: "persist" }];
}

function replaceSlot(
  slots: readonly RoundSlot[],
  index: number,
  slot: RoundSlot,
): RoundSlot[] {
  const out = slots.slice();
  out[index] = slot;
  return out;
}

function pluginOf(plugins: PluginRegistry, meta: RoundMeta): AnyRoundPlugin {
  return plugins[meta.type];
}

/** Hidden time inside the slot's open interval, the current span included. */
function hiddenSoFar(state: RunState, slot: RoundSlot, at: EpochMs): number {
  if (state.hiddenAt === null || slot.openedAt === null) return slot.hiddenMs;
  return (
    slot.hiddenMs + Math.max(0, at - Math.max(state.hiddenAt, slot.openedAt))
  );
}

function activeSoFar(slot: RoundSlot, hiddenMs: number, at: EpochMs): number {
  if (slot.openedAt === null) return 0;
  return Math.max(0, at - slot.openedAt - hiddenMs);
}

function isPaused(state: RunState): boolean {
  return state.hiddenAt !== null || state.pauseRequested;
}

/** Moves the countdown forward when a pause ends, or starts a pause. */
function updatePause(before: RunState, after: RunState, at: EpochMs): RunState {
  if (after.countdownEndsAt === null) return after;
  const wasPaused = before.pausedAt !== null;
  const nowPaused = isPaused(after);
  if (!wasPaused && nowPaused) return { ...after, pausedAt: at };
  if (wasPaused && !nowPaused && before.pausedAt !== null) {
    return {
      ...after,
      pausedAt: null,
      countdownEndsAt: after.countdownEndsAt + (at - before.pausedAt),
    };
  }
  return after;
}

const FINAL = new Set(["finishing", "finished", "abandoned"]);

/** Invariant 6 for `clock` runs: past the countdown, the run finishes. */
function expire(state: RunState, at: EpochMs): Transition | null {
  if (
    state.countdownEndsAt === null ||
    state.pausedAt !== null ||
    at < state.countdownEndsAt ||
    FINAL.has(state.phase)
  ) {
    return null;
  }
  // The round on screen is discarded: unscored, and never marked seen.
  const slots = state.slots.filter((slot) => slot.outcome !== null);
  const next: RunState = {
    ...state,
    phase: "finishing",
    slots,
    index: Math.max(0, slots.length - 1),
    pending: null,
    error: null,
    failing: null,
    updatedAt: at,
  };
  return { state: next, commands: [{ kind: "finish" }, ...persistFor(next)] };
}

export function createRun(config: RunConfig, at: EpochMs): Transition {
  const slots = config.rounds === "stream" ? [] : config.rounds.map(emptySlot);
  const state: RunState = {
    config,
    phase: "opening",
    index: 0,
    slots,
    pending: null,
    error: null,
    score: 0,
    strikes: 0,
    startedAt: at,
    countdownEndsAt: countdownEnd(config, at),
    pausedAt: null,
    summary: null,
    updatedAt: at,
    hiddenAt: null,
    pauseRequested: false,
    failing: null,
  };
  if (config.rounds !== "stream" && slots.length === 0) {
    return {
      state: { ...state, phase: "finishing" },
      commands: [{ kind: "finish" }],
    };
  }
  return { state, commands: [{ kind: "open_round", index: 0 }] };
}

function onOpened(
  state: RunState,
  event: EventOf<"opened">,
  at: EpochMs,
  plugins: PluginRegistry,
): Transition {
  if (state.phase !== "opening" || event.index !== state.index)
    return same(state);
  const existing = state.slots[event.index];
  const streamNew =
    existing === undefined &&
    state.config.rounds === "stream" &&
    event.meta !== undefined &&
    event.index === state.slots.length;
  if (existing === undefined && !streamNew) return same(state);
  const meta = event.meta ?? (existing as RoundSlot).meta;
  const base = existing ?? emptySlot(meta);
  const plugin = pluginOf(plugins, meta);
  const slot: RoundSlot = {
    ...base,
    meta,
    open: event.open,
    client: plugin.init(event.open),
    openedAt: at,
    requests: base.requests + 1,
    activeMs: 0,
    hiddenMs: 0,
  };
  const next: RunState = {
    ...state,
    phase: "active",
    slots: streamNew
      ? [...state.slots, slot]
      : replaceSlot(state.slots, event.index, slot),
    error: null,
    failing: null,
    updatedAt: at,
  };
  return {
    state: next,
    commands: [{ kind: "focus", target: "round_heading" }, ...persistFor(next)],
  };
}

function withNextMeta(
  slots: RoundSlot[],
  index: number,
  next: RoundMeta | null,
): RoundSlot[] {
  const following = slots[index + 1];
  if (next === null || following === undefined) return slots;
  return replaceSlot(slots, index + 1, { ...following, meta: next });
}

function onWithdrawn(
  state: RunState,
  event: EventOf<"withdrawn">,
  at: EpochMs,
): Transition {
  if (state.phase !== "opening" || event.index !== state.index)
    return same(state);
  const existing = state.slots[event.index];
  if (existing === undefined) return same(state);
  const meta = { ...existing.meta, voided: true };
  const outcome = outcomeFromReveal(meta, event.reveal);
  const slot: RoundSlot = {
    ...existing,
    meta,
    reveal: event.reveal,
    outcome,
    resolvedAt: at,
    requests: existing.requests + 1,
  };
  const next: RunState = {
    ...state,
    phase: "revealed",
    slots: withNextMeta(
      replaceSlot(state.slots, event.index, slot),
      event.index,
      event.next,
    ),
    score: state.score + event.reveal.points,
    error: null,
    failing: null,
    updatedAt: at,
  };
  return {
    state: next,
    commands: [
      { kind: "focus", target: "reveal_heading" },
      ...persistFor(next),
    ],
  };
}

function onIntent(
  state: RunState,
  event: EventOf<"intent">,
  at: EpochMs,
  plugins: PluginRegistry,
): Transition {
  // Invariant 1: while judging (pending set), new intents are refused, and
  // so are intents against a state the server called stale until it resyncs.
  if (state.phase !== "active" || state.pending !== null) return same(state);
  if (state.error?.code === "stale") return same(state);
  const slot = state.slots[state.index];
  if (slot === undefined || slot.open === null) return same(state);
  const plugin = pluginOf(plugins, slot.meta);
  const check =
    event.intent.family === plugin.family
      ? plugin.check(slot.client, event.intent)
      : ({ ok: false, error: "invalid_input" } as const);
  if (!check.ok) {
    return same({
      ...state,
      error: { code: check.error, retryable: false },
      updatedAt: at,
    });
  }
  const hiddenMs = hiddenSoFar(state, slot, at);
  const activeMs = activeSoFar(slot, hiddenMs, at);
  const next: RunState = {
    ...state,
    phase: "judging",
    slots: replaceSlot(state.slots, state.index, { ...slot, activeMs }),
    pending: { key: event.key, intent: event.intent, sentAt: at, tries: 1 },
    error: null,
    failing: null,
    updatedAt: at,
  };
  return {
    state: next,
    commands: [
      {
        kind: "judge",
        index: state.index,
        intent: event.intent,
        key: event.key,
        hiddenMs,
        activeMs,
      },
    ],
  };
}

function scoreFor(
  state: RunState,
  outcome: RoundOutcome,
  activeMs: number,
): number {
  if (state.config.scoring === "blitz" && outcome.family === "choice") {
    return outcome.voided ? 0 : blitzPoints(activeMs, outcome.correct);
  }
  return outcomePoints(outcome);
}

function onVerdict(
  state: RunState,
  event: EventOf<"verdict">,
  at: EpochMs,
  plugins: PluginRegistry,
): Transition {
  // Invariant 3: only the verdict for the pending key applies.
  if (state.phase !== "judging" || state.pending?.key !== event.key) {
    return same(state);
  }
  const slot = state.slots[state.index];
  if (slot === undefined) return same(state);
  const plugin = pluginOf(plugins, slot.meta);
  const verdict = event.verdict;
  const announcement = plugin.announce(slot.client, verdict);
  const client = plugin.apply(slot.client, verdict);
  const announce: RunCommand = {
    kind: "announce",
    announcement,
    politeness: "polite",
  };

  if (verdict.kind === "continue") {
    const next: RunState = {
      ...state,
      phase: "active",
      slots: replaceSlot(state.slots, state.index, {
        ...slot,
        open: verdict.open,
        client,
        requests: slot.requests + 1,
        activeMs: activeSoFar(slot, hiddenSoFar(state, slot, at), at),
      }),
      pending: null,
      error: null,
      failing: null,
      updatedAt: at,
    };
    return {
      state: next,
      commands: [
        announce,
        {
          kind: "focus",
          target:
            plugin.family === "mystery" ? "clue_heading" : "round_heading",
        },
        ...persistFor(next),
      ],
    };
  }

  // Resolved: close the round's hidden span and stop its active time.
  const hiddenMs = hiddenSoFar(state, slot, at);
  const activeMs = activeSoFar(slot, hiddenMs, at);
  const reported = plugin.outcome(client, slot.meta);
  let outcome: RoundOutcome =
    reported ?? outcomeFromReveal(slot.meta, verdict.reveal);
  if (outcome.family === "choice" && outcome.answerMs === null) {
    outcome = { ...outcome, answerMs: activeMs };
  }
  const resolved: RoundSlot = {
    ...slot,
    client,
    reveal: verdict.reveal,
    outcome,
    resolvedAt: at,
    requests: slot.requests + 1,
    activeMs,
    hiddenMs,
  };
  const next: RunState = {
    ...state,
    phase: "revealed",
    slots: withNextMeta(
      replaceSlot(state.slots, state.index, resolved),
      state.index,
      verdict.next,
    ),
    pending: null,
    error: null,
    failing: null,
    score: state.score + scoreFor(state, outcome, activeMs),
    strikes: state.strikes + (isWrongOutcome(outcome) ? 1 : 0),
    // The page may still be hidden; the next round's span starts at its open.
    updatedAt: at,
  };
  return {
    state: next,
    commands: [
      announce,
      { kind: "focus", target: "reveal_heading" },
      ...persistFor(next),
    ],
  };
}

function onFailed(
  state: RunState,
  event: EventOf<"failed">,
  at: EpochMs,
): Transition {
  const error = event.error;
  let op: "open" | "judge" | "finish";
  if (event.key !== null) {
    if (state.phase !== "judging" || state.pending?.key !== event.key) {
      return same(state);
    }
    op = "judge";
  } else if (state.phase === "opening") {
    op = "open";
  } else if (state.phase === "finishing") {
    op = "finish";
  } else {
    return same(state);
  }

  const rateLimited = error.code === "rate_limited";
  if (rateLimited || error.retryable) {
    const count = (state.failing?.op === op ? state.failing.count : 0) + 1;
    const next: RunState = {
      ...state,
      error: { code: error.code, retryable: true },
      failing: {
        op,
        since: state.failing?.op === op ? state.failing.since : at,
        count,
        code: error.code,
        retryAfterMs: error.retryAfterMs,
      },
      updatedAt: at,
    };
    const afterMs = retryDelayMs(
      rateLimited ? "rate_limited" : "transport",
      count,
      rateLimited ? error.retryAfterMs : null,
    );
    return {
      state: next,
      commands: [{ kind: "schedule_retry", tries: count, afterMs }],
    };
  }

  const settled: RunState = {
    ...state,
    error: { code: error.code, retryable: false },
    failing: null,
    updatedAt: at,
    ...(op === "judge" ? { phase: "active" as const, pending: null } : {}),
  };
  return {
    state: settled,
    commands: error.code === "stale" ? [{ kind: "resync" }] : [],
  };
}

function onRetry(state: RunState, at: EpochMs): Transition {
  if (state.phase === "judging" && state.pending !== null) {
    const slot = state.slots[state.index];
    if (slot === undefined) return same(state);
    const hiddenMs = hiddenSoFar(state, slot, at);
    const pending = { ...state.pending, tries: state.pending.tries + 1 };
    return {
      state: { ...state, pending, updatedAt: at },
      commands: [
        {
          kind: "judge",
          index: state.index,
          intent: pending.intent,
          // Invariant 2: the same key, so the server returns the stored result.
          key: pending.key,
          hiddenMs,
          activeMs: activeSoFar(slot, hiddenMs, at),
        },
      ],
    };
  }
  if (state.phase === "opening") {
    return {
      state: { ...state, updatedAt: at },
      commands: [{ kind: "open_round", index: state.index }],
    };
  }
  if (state.phase === "finishing") {
    return {
      state: { ...state, updatedAt: at },
      commands: [{ kind: "finish" }],
    };
  }
  return same(state);
}

function finishing(state: RunState, at: EpochMs): Transition {
  const next: RunState = {
    ...state,
    phase: "finishing",
    error: null,
    failing: null,
    updatedAt: at,
  };
  return { state: next, commands: [{ kind: "finish" }, ...persistFor(next)] };
}

function onContinue(state: RunState, at: EpochMs): Transition {
  if (state.phase !== "revealed") return same(state);
  const rule = state.config.endRule;
  const lastFixed =
    state.config.rounds !== "stream" && state.index >= state.slots.length - 1;
  if (lastFixed || (rule.kind === "strikes" && state.strikes >= rule.max)) {
    return finishing(state, at);
  }
  const next: RunState = {
    ...state,
    phase: "opening",
    index: state.index + 1,
    error: null,
    failing: null,
    updatedAt: at,
  };
  return {
    state: next,
    commands: [{ kind: "open_round", index: next.index }, ...persistFor(next)],
  };
}

function onFinished(
  state: RunState,
  event: EventOf<"finished">,
  at: EpochMs,
): Transition {
  if (
    state.phase !== "finishing" &&
    state.phase !== "opening" &&
    state.phase !== "revealed"
  ) {
    return same(state);
  }
  const next: RunState = {
    ...state,
    phase: "finished",
    summary: event.summary,
    pending: null,
    error: null,
    failing: null,
    updatedAt: at,
  };
  return { state: next, commands: persistFor(next) };
}

function onVisibility(
  state: RunState,
  event: EventOf<"visibility">,
  at: EpochMs,
): Transition {
  if (event.hidden) {
    if (state.hiddenAt !== null) return same(state);
    return same(
      updatePause(state, { ...state, hiddenAt: at, updatedAt: at }, at),
    );
  }
  if (state.hiddenAt === null) return same(state);
  let slots = state.slots;
  const slot = slots[state.index];
  const open =
    (state.phase === "active" || state.phase === "judging") &&
    slot !== undefined &&
    slot.openedAt !== null &&
    slot.outcome === null;
  if (open && slot !== undefined) {
    slots = replaceSlot(slots, state.index, {
      ...slot,
      hiddenMs: hiddenSoFar(state, slot, at),
    });
  }
  return same(
    updatePause(state, { ...state, slots, hiddenAt: null, updatedAt: at }, at),
  );
}

function onPause(
  state: RunState,
  event: EventOf<"pause">,
  at: EpochMs,
): Transition {
  if (state.pauseRequested === event.paused) return same(state);
  return same(
    updatePause(
      state,
      { ...state, pauseRequested: event.paused, updatedAt: at },
      at,
    ),
  );
}

function isAttemptSnapshot(
  snapshot: AttemptSnapshot | LocalRunSnapshot,
): snapshot is AttemptSnapshot {
  return "attemptId" in snapshot;
}

function resumeSealed(
  state: RunState,
  snapshot: AttemptSnapshot,
  at: EpochMs,
  plugins: PluginRegistry,
): Transition {
  const resolved = new Map(snapshot.resolved.map((r) => [r.meta.index, r]));
  let slots: RoundSlot[] = snapshot.rounds.map((meta) => {
    const done = resolved.get(meta.index);
    if (done === undefined) return emptySlot(meta);
    return {
      ...emptySlot(done.meta),
      reveal: done.reveal,
      outcome: done.outcome,
      resolvedAt: at,
    };
  });
  const config: RunConfig = {
    ...state.config,
    sealed: true,
    rounds: snapshot.rounds,
    runId: snapshot.attemptId,
  };
  const base: RunState = {
    ...state,
    config,
    slots,
    score: snapshot.points,
    strikes: slots.filter(
      (s) => s.outcome !== null && isWrongOutcome(s.outcome),
    ).length,
    startedAt: snapshot.startedAt,
    pending: null,
    error: null,
    failing: null,
    summary: null,
    updatedAt: at,
  };
  const last = Math.max(0, slots.length - 1);
  if (snapshot.status === "finished") {
    return same({ ...base, phase: "finished", index: last });
  }
  if (snapshot.status === "abandoned") {
    return same({ ...base, phase: "abandoned", index: last });
  }
  const current = snapshot.current;
  if (current === null) {
    const lastSlot = slots[last];
    if (lastSlot?.reveal) {
      return {
        state: { ...base, phase: "revealed", index: last },
        commands: [{ kind: "focus", target: "reveal_heading" }],
      };
    }
    return finishing({ ...base, index: last }, at);
  }
  const slot = slots[current.index];
  if (slot === undefined) return finishing({ ...base, index: last }, at);
  if (current.open !== null) {
    const plugin = pluginOf(plugins, slot.meta);
    slots = replaceSlot(slots, current.index, {
      ...slot,
      open: current.open,
      client: plugin.init(current.open),
      // The client measure restarts at the reload; the server keeps its own.
      openedAt: at,
    });
    return {
      state: { ...base, slots, phase: "active", index: current.index },
      commands: [{ kind: "focus", target: "round_heading" }],
    };
  }
  const previous = slots[current.index - 1];
  if (current.index > 0 && previous?.reveal) {
    // Continue not tapped yet: back on the last reveal.
    return {
      state: { ...base, phase: "revealed", index: current.index - 1 },
      commands: [{ kind: "focus", target: "reveal_heading" }],
    };
  }
  return {
    state: { ...base, phase: "opening", index: current.index },
    commands: [{ kind: "open_round", index: current.index }],
  };
}

function resumeLocal(
  state: RunState,
  snapshot: LocalRunSnapshot,
  at: EpochMs,
  plugins: PluginRegistry,
): Transition {
  const config = snapshot.config;
  let slots = snapshot.slots.map((slot) => ({ ...slot }));
  const base: RunState = {
    ...state,
    config,
    slots,
    index: snapshot.index,
    score: snapshot.score,
    strikes: snapshot.strikes,
    startedAt: snapshot.startedAt,
    // Pauses before the reload are not stored, so a resumed clock run has
    // lost them: the countdown runs from its start.
    countdownEndsAt: countdownEnd(config, snapshot.startedAt),
    pausedAt: null,
    pauseRequested: false,
    pending: null,
    error: null,
    failing: null,
    summary: null,
    updatedAt: at,
  };
  const slot = slots[snapshot.index];
  if (slot === undefined) {
    if (config.rounds === "stream") {
      return {
        state: { ...base, phase: "opening" },
        commands: [{ kind: "open_round", index: snapshot.index }],
      };
    }
    return finishing({ ...base, index: Math.max(0, slots.length - 1) }, at);
  }
  if (slot.outcome !== null) {
    return {
      state: { ...base, phase: "revealed" },
      commands: [{ kind: "focus", target: "reveal_heading" }],
    };
  }
  if (slot.open !== null) {
    const plugin = pluginOf(plugins, slot.meta);
    slots = replaceSlot(slots, snapshot.index, {
      ...slot,
      client: slot.client ?? plugin.init(slot.open),
      openedAt: at,
      activeMs: 0,
      hiddenMs: 0,
    });
    return {
      state: { ...base, slots, phase: "active" },
      commands: [{ kind: "focus", target: "round_heading" }],
    };
  }
  return {
    state: { ...base, phase: "opening" },
    commands: [{ kind: "open_round", index: snapshot.index }],
  };
}

function onResume(
  state: RunState,
  event: EventOf<"resume">,
  at: EpochMs,
  plugins: PluginRegistry,
): Transition {
  return isAttemptSnapshot(event.snapshot)
    ? resumeSealed(state, event.snapshot, at, plugins)
    : resumeLocal(state, event.snapshot, at, plugins);
}

function onAbandon(state: RunState, at: EpochMs): Transition {
  if (
    state.config.sealed ||
    state.phase === "finished" ||
    state.phase === "abandoned"
  ) {
    return same(state);
  }
  return same({
    ...state,
    phase: "abandoned",
    pending: null,
    error: null,
    failing: null,
    updatedAt: at,
  });
}

export function reduceRun(
  state: RunState,
  event: RunEvent,
  plugins: PluginRegistry,
): Transition {
  // Event times never run backwards inside a run, even if the device clock does.
  const at = Math.max(event.at, state.updatedAt);
  if (
    event.type === "tick" ||
    event.type === "intent" ||
    event.type === "opened" ||
    event.type === "continue"
  ) {
    const expired = expire(state, at);
    if (expired !== null) return expired;
  }
  switch (event.type) {
    case "opened":
      return onOpened(state, event, at, plugins);
    case "withdrawn":
      return onWithdrawn(state, event, at);
    case "intent":
      return onIntent(state, event, at, plugins);
    case "verdict":
      return onVerdict(state, event, at, plugins);
    case "failed":
      return onFailed(state, event, at);
    case "retry":
      return onRetry(state, at);
    case "continue":
      return onContinue(state, at);
    case "finished":
      return onFinished(state, event, at);
    case "tick":
      return at > state.updatedAt
        ? same({ ...state, updatedAt: at })
        : same(state);
    case "visibility":
      return onVisibility(state, event, at);
    case "pause":
      return onPause(state, event, at);
    case "resume":
      return onResume(state, event, at, plugins);
    case "abandon":
      return onAbandon(state, at);
  }
}

/** What a local run's `persist` command saves (invariant 8). */
export function toLocalSnapshot(state: RunState): LocalRunSnapshot {
  return {
    config: state.config,
    slots: state.slots,
    score: state.score,
    strikes: state.strikes,
    startedAt: state.startedAt,
    index: state.index,
  };
}
