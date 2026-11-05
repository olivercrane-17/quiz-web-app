/**
 * Extension point (ARCHITECTURE §2.3, §3.12): first-party analytics.
 * `track(name, props)` is typed by the dictionary, so a wrong event name or
 * property is a type error.
 *
 * A stub until ANA-1, which replaces the body with the real queue (memory
 * plus `qz:outbox`, batched to `log_events`). Until then nothing leaves the
 * device. In mock builds every call is checked against the dictionary and
 * recorded in `window.__qzTrackLog`, so E2E specs can assert events before
 * ANA-1 lands; a call the dictionary would refuse logs a console error
 * instead, which fails the spec that made it.
 *
 * Call it only from effects and event handlers.
 */
import {
  checkEventProps,
  type EventName,
  type EventProps,
} from "@/analytics/dictionary";
import type { RunMode } from "@/engine/types";
import { isMockBackend } from "@/lib/env";

/** One recorded call, as specs read it from `window.__qzTrackLog`. */
export interface TrackedEvent {
  name: EventName;
  props: Record<string, unknown>;
}

interface TrackLogHolder {
  __qzTrackLog?: TrackedEvent[];
}

export function track<N extends EventName>(
  name: N,
  props: EventProps<N>,
): void {
  if (typeof window === "undefined" || !isMockBackend()) return;
  const check = checkEventProps(name, props);
  if (!check.ok) {
    const prop = check.prop === null ? "" : ` (${check.prop})`;
    console.error(
      `[analytics] ${String(name)} would be dropped: ${check.problem}${prop}`,
    );
    return;
  }
  const holder = window as unknown as TrackLogHolder;
  (holder.__qzTrackLog ??= []).push({ name, props: { ...props } });
}

/** The dictionary's `mode` values (PRD §7.2). */
export type AnalyticsMode = EventProps<"results_view">["mode"];

/**
 * A run's analytics mode: challenge packs count as challenges and solo play
 * of a draft as a quiz. Rooms aren't runs and pass "room" directly.
 */
export function analyticsMode(mode: RunMode): AnalyticsMode {
  switch (mode) {
    case "pack":
      return "challenge";
    case "quiz_solo":
      return "quiz";
    default:
      return mode;
  }
}
