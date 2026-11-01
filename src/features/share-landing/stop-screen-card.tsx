/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's shared-result card
 * (PRD §3.1.6 item 1): "vs the result you opened: 9/12" with both grids,
 * after a Daily started from a share landing for the same number (the
 * landing's Play stored it in `qz:share-origin`). It renders nothing when
 * `results.challenge` is set, because the head-to-head card comes first and
 * the two never both show.
 *
 * A stub until SHR-2. It renders nothing until then.
 */
import type { DailyResults } from "@/engine/types";

export interface StopScreenCardProps {
  /** The stop screen's results. */
  results: DailyResults;
}

export function SharedResultStopScreenCard(_props: StopScreenCardProps) {
  return null;
}
