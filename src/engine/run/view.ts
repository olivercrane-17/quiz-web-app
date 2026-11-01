/**
 * The run's view model (ARCHITECTURE §4.5): what screens and round
 * components render. Memo-friendly: the same state object always gives the
 * same view object, and the reducer returns the same state for an event
 * that changes nothing.
 */
import type { IntentError, PluginRegistry } from "../rounds/types.ts";
import type { BackendErrorCode } from "../types/results.ts";
import { CHECKING_AFTER_MS, retryNotice } from "./retry.ts";
import type { RoundStatus, RunError, RunState, RunView } from "./types.ts";

/**
 * Validation refusals, from the client check or the server: the round stays
 * interactive and the component shows the message inline.
 */
const INLINE_ERRORS: ReadonlySet<string> = new Set<
  IntentError | BackendErrorCode
>([
  "already_guessed",
  "invalid_input",
  "not_selectable",
  "invalid_entity",
  "blocked_text",
]);

const views = new WeakMap<PluginRegistry, WeakMap<RunState, RunView>>();

function errorStatus(error: RunError): RoundStatus {
  return error.code === "offline" ? "offline" : "error";
}

function statusOf(state: RunState): RoundStatus {
  const failing = state.failing;
  switch (state.phase) {
    case "revealed":
    case "finished":
      return "revealed";
    case "judging": {
      if (failing !== null)
        return failing.code === "offline" ? "offline" : "checking";
      const waited =
        state.pending === null ? 0 : state.updatedAt - state.pending.sentAt;
      return waited >= CHECKING_AFTER_MS ? "checking" : "judging";
    }
    case "opening":
    case "finishing":
      // A silent retry of begin_round or finish reads as a wait, as while
      // judging (invariant 4, PRD §3.0.2); retry.notice says when to speak.
      if (failing !== null)
        return failing.code === "offline" ? "offline" : "checking";
      if (state.error !== null) return errorStatus(state.error);
      return "judging";
    case "active":
      if (state.error === null || INLINE_ERRORS.has(state.error.code))
        return "idle";
      return errorStatus(state.error);
    case "abandoned":
      return "idle";
  }
}

function build(state: RunState, plugins: PluginRegistry): RunView {
  const slot = state.slots[state.index];
  const fixed = state.config.rounds !== "stream";
  const failing = state.failing;
  const countdown =
    state.countdownEndsAt === null
      ? null
      : {
          remainingMs: Math.max(
            0,
            state.countdownEndsAt - (state.pausedAt ?? state.updatedAt),
          ),
          paused: state.pausedAt !== null,
        };
  return {
    phase: state.phase,
    mode: state.config.mode,
    sealed: state.config.sealed,
    index: state.index,
    total: fixed ? state.slots.length : null,
    round:
      slot === undefined
        ? null
        : {
            meta: slot.meta,
            family: plugins[slot.meta.type].family,
            open: slot.open,
            client: slot.client,
            reveal: slot.reveal,
            outcome: slot.outcome,
          },
    status: statusOf(state),
    error: state.error,
    retry:
      failing === null
        ? null
        : {
            op: failing.op,
            code: failing.code,
            count: failing.count,
            waitingMs: state.updatedAt - failing.since,
            retryAfterMs: failing.retryAfterMs,
            notice: retryNotice(
              failing.code === "rate_limited",
              state.updatedAt - failing.since,
              failing.retryAfterMs,
            ),
          },
    inputEnabled:
      state.phase === "active" &&
      state.pending === null &&
      slot?.open != null &&
      state.error?.code !== "stale",
    score: state.score,
    maxPoints: state.slots.reduce((sum, s) => sum + s.meta.maxPoints, 0),
    strikes: state.strikes,
    resolvedCount: state.slots.filter((s) => s.outcome !== null).length,
    isLast: fixed && state.index === state.slots.length - 1,
    countdown,
    summary: state.summary,
  };
}

export function selectRunView(
  state: RunState,
  plugins: PluginRegistry,
): RunView {
  let cache = views.get(plugins);
  if (cache === undefined) {
    cache = new WeakMap();
    views.set(plugins, cache);
  }
  const hit = cache.get(state);
  if (hit !== undefined) return hit;
  const view = build(state, plugins);
  cache.set(state, view);
  return view;
}
