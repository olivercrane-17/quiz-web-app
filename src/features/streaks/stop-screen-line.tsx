/**
 * Extension point (ARCHITECTURE §2.3): the streak line on the stop screen's
 * score card (PRD §3.1.6 item 2): "Streak 6", "Streak 7 · You earned a
 * freeze", or "Streak 23 · paused · repair by the end of Monday".
 *
 * A stub until STK-1, which reads `summary.streak` (and shows milestones
 * once). It renders nothing until then.
 */
import type { FinishSummary } from "@/engine/types";

export interface StreakLineProps {
  /** The finished run's summary; `summary.streak` is null for runs that touch no streak. */
  summary: FinishSummary;
}

export function StreakLine(_props: StreakLineProps) {
  return null;
}
