/**
 * Extension point (ARCHITECTURE §2.3): category mastery on the stats page
 * (PRD §3.4.4), rendered by `/me` (STA-1).
 *
 * A stub until MAS-1, behind the `mastery` flag. It renders nothing until
 * then.
 */
import type { PlayerServerStats } from "@/engine/types";

export interface StatsSectionProps {
  /** The server figures; null offline or while loading (device figures still show). */
  stats: PlayerServerStats | null;
}

export function MasteryStatsSection(_props: StatsSectionProps) {
  return null;
}
