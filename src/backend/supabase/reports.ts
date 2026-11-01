/**
 * The Supabase reports adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-9) replaces it.
 */
import { unavailableArea } from "../areas";
import type { ReportApi } from "../types";
import type { SupabaseContext } from "./context";

export function createReportsArea(_ctx: SupabaseContext): ReportApi {
  return unavailableArea("reports");
}
