/**
 * The Daily screen hands the stop screen the attempt it just finished, so
 * `/daily/42/results` opens on it at once on a client navigation, even if
 * the local day turned over during the Encore. A full load of the results
 * page finds its attempt through `get_today` instead. Memory only: nothing
 * about an attempt is kept on the device (§6.5).
 */
import type { AttemptId } from "@/engine/types";

let recent: { dailyNumber: number; attemptId: AttemptId } | null = null;

export function rememberFinished(
  dailyNumber: number,
  attemptId: AttemptId,
): void {
  recent = { dailyNumber, attemptId };
}

/** The attempt this tab just finished for that Daily, if any. */
export function recentlyFinished(dailyNumber: number): AttemptId | null {
  return recent?.dailyNumber === dailyNumber ? recent.attemptId : null;
}
