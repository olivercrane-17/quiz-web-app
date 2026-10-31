/**
 * The Supabase implementation (ARCHITECTURE §7.5): one adapter per
 * GameBackend area, `<area>.ts`, each written by the SQL ticket that writes
 * the area's RPCs. In Wave 0 every adapter is a stub that answers
 * `unavailable`, so a production build shows each online feature's
 * not-available state until its SQL lands.
 */
import { composeBackend } from "../areas";
import type { BackendDeps } from "../deps";
import type { BackendArea, GameBackend } from "../types";
import { createAnalyticsArea } from "./analytics";
import { createChallengesArea } from "./challenges";
import type { SupabaseContext } from "./context";
import { createDailyArea } from "./daily";
import { createGroupsArea } from "./groups";
import { createHealthArea } from "./health";
import { createIdentityArea } from "./identity";
import { createPracticeArea } from "./practice";
import { createQuizzesArea } from "./quizzes";
import { createReportsArea } from "./reports";
import { createRoomsArea } from "./rooms";
import { createSealedArea } from "./sealed";
import { createStatsArea } from "./stats";
import { createStreaksArea } from "./streaks";

const AREAS: { [A in BackendArea]: (ctx: SupabaseContext) => GameBackend[A] } =
  {
    identity: createIdentityArea,
    sealed: createSealedArea,
    daily: createDailyArea,
    streaks: createStreaksArea,
    stats: createStatsArea,
    challenges: createChallengesArea,
    groups: createGroupsArea,
    rooms: createRoomsArea,
    quizzes: createQuizzesArea,
    reports: createReportsArea,
    practice: createPracticeArea,
    analytics: createAnalyticsArea,
    health: createHealthArea,
  };

export function createSupabaseBackend(deps: BackendDeps): GameBackend {
  const ctx: SupabaseContext = { deps };
  return composeBackend("supabase", (area) => AREAS[area](ctx));
}
