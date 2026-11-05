/**
 * The Supabase challenges adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-11) replaces it.
 */
import { unavailableArea } from "../areas";
import type { ChallengeApi } from "../types";
import type { SupabaseContext } from "./context";

export function createChallengesArea(_ctx: SupabaseContext): ChallengeApi {
  return unavailableArea("challenges");
}
