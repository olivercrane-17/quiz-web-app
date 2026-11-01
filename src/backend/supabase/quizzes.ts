/**
 * The Supabase quizzes adapter (ARCHITECTURE §7.5). A Wave 0 stub: every
 * method answers `unavailable` until the SQL ticket that writes the area's
 * RPCs (SQL-15) replaces it.
 */
import { unavailableArea } from "../areas";
import type { QuizApi } from "../types";
import type { SupabaseContext } from "./context";

export function createQuizzesArea(_ctx: SupabaseContext): QuizApi {
  return unavailableArea("quizzes");
}
