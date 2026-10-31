/**
 * The Supabase stats adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-7) replaces it.
 */
import { unavailableArea } from "../areas";
import type { StatsApi } from "../types";
import type { SupabaseContext } from "./context";

export function createStatsArea(_ctx: SupabaseContext): StatsApi {
  return unavailableArea("stats");
}
