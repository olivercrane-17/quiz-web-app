/**
 * Extension point (ARCHITECTURE §2.3): the achievements summary on the
 * stats page (PRD §3.4.5), rendered by `/me` (STA-1), linking to
 * `/me/achievements`.
 *
 * A stub until MAS-1, behind the `achievements` flag. It renders nothing
 * until then.
 */
import type { PlayerServerStats } from "@/engine/types";

export interface AchievementsSummaryProps {
  /** The server figures; null offline or while loading. */
  stats: PlayerServerStats | null;
}

export function AchievementsSummary(_props: AchievementsSummaryProps) {
  return null;
}
