/**
 * Closed answer lists (ARCHITECTURE §2.3, §5.5). Final signatures; MYS-1
 * builds the suggestion handle on `loadAnswerList`, and the mock server
 * judges guesses with `loadEntityLookup`.
 *
 * Each list is a hashed file of `[id, display, keys, popularity]` tuples
 * under public/content/lists/, named in the generated manifest and served
 * cache-first (§3.11.1). A mock build reads the fixture world's lists
 * instead, so its Dailies' entities are there (world.ts); their decoder
 * loads with them, so no other build carries it. A failed load is not
 * cached, so asking again retries it.
 */
import type { EntityLookup } from "@/engine/rounds/types";
import type { AnswerList, AnswerType } from "@/engine/types";

import type { LoadResult } from "../types";
import { bankList } from "./bank";
import { contentWorld } from "./world";

/** One answer type's list, as the client projection of §5.5. */
export async function loadAnswerList(
  type: AnswerType,
): Promise<LoadResult<AnswerList>> {
  try {
    if (contentWorld() === "fixtures") {
      // Only a mock build plays the fixture world, so its decoder stays out
      // of every other build's first load.
      const { fixtureWorldList } = await import("./fixture-world");
      const list = await fixtureWorldList(type);
      return list === null
        ? { ok: false, error: "not_found" }
        : { ok: true, value: list };
    }
    return await bankList(type);
  } catch {
    return { ok: false, error: "failed" };
  }
}

/**
 * The judge's view of one list (§4.4, `JudgeContext.entities`): each active
 * entry's display and clue-4 option label. For the mock server and tests,
 * so the fixture world only: the real server judges from
 * `private.answer_entities`, and the shipped projection carries no option
 * labels, so the bank answers `not_found`.
 */
export async function loadEntityLookup(
  type: AnswerType,
): Promise<LoadResult<EntityLookup>> {
  try {
    if (contentWorld() !== "fixtures") return { ok: false, error: "not_found" };
    const { fixtureWorldEntityLookup } = await import("./fixture-world");
    const lookup = await fixtureWorldEntityLookup(type);
    return lookup === null
      ? { ok: false, error: "not_found" }
      : { ok: true, value: lookup };
  } catch {
    return { ok: false, error: "failed" };
  }
}
