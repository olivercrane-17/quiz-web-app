/**
 * The Supabase sealed adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-4 and SQL-5) replaces it.
 */
import { unavailableArea } from "../areas";
import type { SealedRunApi } from "../types";
import type { SupabaseContext } from "./context";

export function createSealedArea(_ctx: SupabaseContext): SealedRunApi {
  return unavailableArea("sealed");
}
