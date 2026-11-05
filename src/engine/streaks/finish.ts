/**
 * `applyFinish` (ARCHITECTURE §4.11, §8.10; PRD §3.4.2, §4.4.4, §4.4.5): what
 * one finished Daily does to the streak counters, and the status its date
 * takes.
 *
 * - `on_time` (a ranked attempt with streak credit) stores Played. Over a
 *   stored Freeze it refunds the freeze, up to 2 held; over Protected (or a
 *   Missed date, which an open attempt's date should never be) it just
 *   becomes Played. Both can happen after a westward zone change or a gap
 *   evaluated while that date's attempt was still open.
 * - `repair` turns a Missed date into Repaired. A repair of anything else
 *   changes nothing, like `other`.
 * - Both count toward freezes: every 7th counted finish grants one while
 *   fewer than 2 are held, and progress stays at 0 while 2 are held
 *   (AC-FRZ-01). A refund is applied first, so a refund that fills the
 *   second slot resets the progress.
 * - `other` (an unranked play that repairs nothing, a second repair inside
 *   the 168 hours, a finish without streak credit) changes nothing. Archive
 *   plays of a Freeze date refund nothing (§4.4.5).
 */
import {
  FINISHES_PER_FREEZE,
  MAX_FREEZES,
  type StreakCounters,
  type StreakFinish,
} from "./types.ts";

export interface FinishOutcome {
  counters: StreakCounters;
  /** The status to store for the finished date, or null when nothing changes. */
  status: "played" | "repaired" | null;
  /** A freeze was granted by this finish (the 7th counted finish). */
  freezeEarned: boolean;
  /** A stored Freeze turned Played and its freeze came back. */
  freezeRefunded: boolean;
}

const asHeld = (count: number): 0 | 1 | 2 =>
  count >= MAX_FREEZES ? 2 : count <= 0 ? 0 : 1;

export function finishOutcome(
  state: StreakCounters,
  finish: StreakFinish,
): FinishOutcome {
  const counts =
    finish.kind === "on_time" ||
    (finish.kind === "repair" && finish.existing === "missed");
  if (!counts) {
    return {
      counters: state,
      status: null,
      freezeEarned: false,
      freezeRefunded: false,
    };
  }

  let held: number = state.freezesHeld;
  let freezeRefunded = false;
  if (finish.kind === "on_time" && finish.existing === "freeze") {
    if (held < MAX_FREEZES) {
      held += 1;
      freezeRefunded = true;
    }
  }

  let progress = state.freezeProgress;
  let freezeEarned = false;
  if (held >= MAX_FREEZES) {
    progress = 0;
  } else {
    progress += 1;
    if (progress >= FINISHES_PER_FREEZE) {
      held += 1;
      progress = 0;
      freezeEarned = true;
    }
  }
  if (held >= MAX_FREEZES) progress = 0;

  return {
    counters: {
      freezesHeld: asHeld(held),
      freezeProgress: progress,
      dailiesFinished: state.dailiesFinished + 1,
    },
    status: finish.kind === "repair" ? "repaired" : "played",
    freezeEarned,
    freezeRefunded,
  };
}

export function applyFinish(
  state: StreakCounters,
  finish: StreakFinish,
): StreakCounters {
  return finishOutcome(state, finish).counters;
}
