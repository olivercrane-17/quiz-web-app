/**
 * Closed answer lists (ARCHITECTURE §2.3, §5.5). Final signatures; MYS-1
 * builds the suggestion handle on `loadAnswerList`, the mock server can
 * judge guesses with `loadEntityLookup`, and CNT-1 switches both from the
 * fixture lists to the generated manifest's hashed lists (cache-first).
 *
 * A failed load is not cached, so asking again retries it.
 */
import type { EntityLookup } from "@/engine/rounds/types";
import type { AnswerList, AnswerType } from "@/engine/types";

import type { LoadResult } from "../types";

/** One answer type's list, as the client projection of §5.5. */
export async function loadAnswerList(
  type: AnswerType,
): Promise<LoadResult<AnswerList>> {
  try {
    const { loadFixtureList } = await import("./fixtures/lists");
    const decoded = await loadFixtureList(type);
    return decoded === null
      ? { ok: false, error: "not_found" }
      : { ok: true, value: decoded.list };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/**
 * The judge's view of one list (§4.4, `JudgeContext.entities`): each active
 * entry's display and clue-4 option label. For the mock server and tests;
 * the real server reads `private.answer_entities`.
 */
export async function loadEntityLookup(
  type: AnswerType,
): Promise<LoadResult<EntityLookup>> {
  try {
    const { entityLookupOf, loadFixtureList } =
      await import("./fixtures/lists");
    const decoded = await loadFixtureList(type);
    return decoded === null
      ? { ok: false, error: "not_found" }
      : { ok: true, value: entityLookupOf(decoded) };
  } catch {
    return { ok: false, error: "failed" };
  }
}
