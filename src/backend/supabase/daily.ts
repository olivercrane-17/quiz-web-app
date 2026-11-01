/**
 * The Supabase daily adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-4) replaces it.
 */
import { unavailableArea } from "../areas";
import type { DailyApi } from "../types";
import type { SupabaseContext } from "./context";

export function createDailyArea(_ctx: SupabaseContext): DailyApi {
  return unavailableArea("daily");
}
