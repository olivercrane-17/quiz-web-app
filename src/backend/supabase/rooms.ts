/**
 * The Supabase rooms adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-13 and SQL-14) replaces it.
 */
import { unavailableArea } from "../areas";
import type { RoomApi } from "../types";
import type { SupabaseContext } from "./context";

export function createRoomsArea(_ctx: SupabaseContext): RoomApi {
  return unavailableArea("rooms");
}
