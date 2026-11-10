/**
 * What the app has built yet, for the help pages' promises (RITE round 3,
 * R3-06): a page describes a feature as present only once its switch is
 * on, and until then gates the sentence or marks it "coming later". One
 * switch per unbuilt feature, so the ticket that builds it turns its own
 * sentences on, here and nowhere else:
 *
 *   STREAKS                     STK-1, the streak line, chip and stats
 *   STREAK_FREEZES_AND_REPAIRS  the freeze and repair offers (PRD §4.4)
 *   GROUPS                      GRP-1
 *   CHALLENGES                  CHL-1
 *   CROWD_NUMBERS               DLY-3, the chart of how everyone did and
 *                               the numbers under each round
 *
 * The others live with their owners: `STOP_SCREEN_PERCENTILE` and
 * `STOP_SCREEN_PLAYER_COUNT` in `@/features/daily` (DLY-3), and
 * `SETTINGS_CONTROLS` in `./accessibility` (SET-1), which also stands for
 * Download my data and Delete my data.
 */
import {
  STOP_SCREEN_PERCENTILE,
  STOP_SCREEN_PLAYER_COUNT,
} from "@/features/daily";

import { SETTINGS_CONTROLS } from "./accessibility";

/** Whether the app shows streaks anywhere (STK-1). */
export const STREAKS = false;

/** Whether streak freezes and repairs are offered (PRD §4.4). */
export const STREAK_FREEZES_AND_REPAIRS = false;

/** Whether Groups and their boards exist (GRP-1). */
export const GROUPS = false;

/** Whether challenge links can be made and played (CHL-1). */
export const CHALLENGES = false;

/**
 * Whether results show the crowd's numbers: the chart of how everyone did
 * and the numbers under each round (DLY-3).
 */
export const CROWD_NUMBERS = false;

/** What the app has built, which the pages' promises follow (R3-06). */
export interface ShippedFeatures {
  /** "You beat 64% of players so far today." (DLY-3). */
  percentile: boolean;
  /** How many have played, below the percentile's threshold (DLY-3). */
  playerCount: boolean;
  crowdNumbers: boolean;
  streaks: boolean;
  freezesAndRepairs: boolean;
  groups: boolean;
  challenges: boolean;
  /** Settings' controls, Download my data and Delete my data (SET-1). */
  settings: boolean;
}

export const SHIPPED_FEATURES: ShippedFeatures = {
  percentile: STOP_SCREEN_PERCENTILE,
  playerCount: STOP_SCREEN_PLAYER_COUNT,
  crowdNumbers: CROWD_NUMBERS,
  streaks: STREAKS,
  freezesAndRepairs: STREAK_FREEZES_AND_REPAIRS,
  groups: GROUPS,
  challenges: CHALLENGES,
  settings: SETTINGS_CONTROLS,
};

/** Every switch on: the pages as they read once everything is built. */
export const EVERYTHING_SHIPPED: ShippedFeatures = {
  percentile: true,
  playerCount: true,
  crowdNumbers: true,
  streaks: true,
  freezesAndRepairs: true,
  groups: true,
  challenges: true,
  settings: true,
};

/** "A", "A and B", "A, B and C". */
export function listOf(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}
