/**
 * Practice packs (ARCHITECTURE §2.3, §5.3). Final signature; PRA-1 builds
 * practice on it, and CNT-1 switches it from the fixture items to the
 * generated manifest's hashed packs, fetched per category and cached by the
 * service worker.
 */
import type { CategoryId } from "@/engine/types";

import type { LoadResult, PracticePack } from "../types";

/** The version fixture packs report until CNT-1's manifest names real ones. */
export const FIXTURE_PACK_VERSION = "fixtures";

/** One category's practice pack. */
export async function loadPracticePack(
  category: CategoryId,
): Promise<LoadResult<PracticePack>> {
  try {
    const { FIXTURE_PRACTICE_ITEMS } = await import("./fixtures/practice");
    const items = FIXTURE_PRACTICE_ITEMS.filter(
      (item) => item.category === category,
    );
    if (items.length === 0) return { ok: false, error: "not_found" };
    return {
      ok: true,
      value: { category, version: FIXTURE_PACK_VERSION, items },
    };
  } catch {
    return { ok: false, error: "failed" };
  }
}
