/**
 * The Supabase groups adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-12) replaces it.
 */
import { unavailableArea } from "../areas";
import type { GroupApi } from "../types";
import type { SupabaseContext } from "./context";

export function createGroupsArea(_ctx: SupabaseContext): GroupApi {
  return unavailableArea("groups");
}
