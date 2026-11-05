/**
 * The Supabase health adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-8) replaces it.
 */
import { unavailableArea } from "../areas";
import type { HealthApi } from "../types";
import type { SupabaseContext } from "./context";

export function createHealthArea(_ctx: SupabaseContext): HealthApi {
  return unavailableArea("health");
}
