/**
 * Closed answer lists (ARCHITECTURE §2.3, §5.5). Final signature; MYS-1
 * builds the suggestion handle on it, and CNT-1 switches it from the fixture
 * lists to the generated manifest's hashed lists (cache-first).
 */
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
