/**
 * What `/daily/[number]/results` shows, worked out from the backend: the
 * results of the attempt this tab just finished (the handoff), or of
 * today's finished attempt (`get_today`), or why there are none to show.
 * Archive results arrive with ARC-1.
 */
import type { GameBackend } from "@/backend";
import type {
  BackendErrorCode,
  DailyResults,
  EpochMs,
  TimeZone,
} from "@/engine/types";

import { recentlyFinished } from "../model/handoff";

export type ResultsState =
  | { kind: "loading" }
  | { kind: "ready"; results: DailyResults; nextUnlockAt: EpochMs | null }
  /** Today's Daily, not finished yet. */
  | { kind: "not_finished" }
  /** Another date's results, which the archive serves (ARC-1). */
  | { kind: "elsewhere" }
  /** An address with no Daily number in it. */
  | { kind: "not_found" }
  | { kind: "error"; code: BackendErrorCode; refId: string | null };

export async function loadResults(
  backend: GameBackend,
  dailyNumber: number,
  tz: TimeZone,
): Promise<ResultsState> {
  const today = await backend.daily.today(tz);
  let attemptId = recentlyFinished(dailyNumber);
  if (today.ok && today.value.daily.dailyNumber === dailyNumber) {
    if (today.value.status !== "finished") return { kind: "not_finished" };
    attemptId ??= today.value.attemptId;
  } else if (!today.ok && attemptId === null) {
    return { kind: "error", code: today.error.code, refId: today.error.refId };
  }
  if (attemptId === null) return { kind: "elsewhere" };
  const results = await backend.daily.results(attemptId);
  if (!results.ok) {
    return results.error.code === "not_found"
      ? { kind: "elsewhere" }
      : { kind: "error", code: results.error.code, refId: results.error.refId };
  }
  return {
    kind: "ready",
    results: results.value,
    nextUnlockAt:
      today.ok && today.value.daily.dailyNumber === dailyNumber
        ? today.value.nextUnlockAt
        : null,
  };
}
