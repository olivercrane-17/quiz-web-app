/**
 * The Supabase practice adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-9) replaces it.
 */
import { unavailableArea } from "../areas";
import type { PracticeSyncApi } from "../types";
import type { SupabaseContext } from "./context";

export function createPracticeArea(_ctx: SupabaseContext): PracticeSyncApi {
  return unavailableArea("practice");
}
