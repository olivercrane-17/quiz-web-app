/**
 * The Supabase identity adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-2) replaces it.
 */
import { unavailableArea } from "../areas";
import type { IdentityApi } from "../types";
import type { SupabaseContext } from "./context";

export function createIdentityArea(_ctx: SupabaseContext): IdentityApi {
  return unavailableArea("identity");
}
