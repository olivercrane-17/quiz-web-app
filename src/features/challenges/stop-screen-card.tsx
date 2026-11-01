/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's head-to-head card
 * (PRD §3.1.6 item 1), after a ranked or repairing challenge run: the
 * verdict, both grids and Rematch in the secondary style. The stop screen
 * renders it before the shared-result card and shows the first one that
 * renders; the shared-result card yields whenever `results.challenge` is
 * set, so they never both show.
 *
 * A stub until CHL-1. It renders nothing until then.
 */
import type { DailyResults } from "@/engine/types";

export interface StopScreenCardProps {
  /** The stop screen's results; `challenge` is set when a challenge run landed here (§10.1). */
  results: DailyResults;
}

export function ChallengeStopScreenCard(_props: StopScreenCardProps) {
  return null;
}
