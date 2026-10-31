/**
 * The Supabase streaks adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-6) replaces it.
 */
import { unavailableArea } from "../areas";
import type { StreakApi } from "../types";
import type { SupabaseContext } from "./context";

export function createStreaksArea(_ctx: SupabaseContext): StreakApi {
  return unavailableArea("streaks");
}
