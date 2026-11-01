/**
 * The Supabase analytics adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-10) replaces it.
 */
import { unavailableArea } from "../areas";
import type { AnalyticsApi } from "../types";
import type { SupabaseContext } from "./context";

export function createAnalyticsArea(_ctx: SupabaseContext): AnalyticsApi {
  return unavailableArea("analytics");
}
