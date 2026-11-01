/**
 * Practice packs (ARCHITECTURE §2.3, §5.3). Final signature; PRA-1 builds
 * practice on it, and CNT-1 switches it from the fixture items to the
 * generated manifest's hashed packs, fetched per category and cached by the
 * service worker.
 *
 * Until then the fixture module (content/fixtures/practice/, §5.6) is one
 * lazy chunk, loaded the first time a run needs it, so no route carries the
 * items in its first load.
 */
import {
  CATEGORY_IDS,
  type CategoryId,
  type PracticeItem,
} from "@/engine/types";

import type { LoadError, LoadResult, PracticePack } from "../types";

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

/** Of several failures, the one the player should hear about. */
function worstError(errors: readonly LoadError[]): LoadError {
  if (errors.includes("offline")) return "offline";
  if (errors.includes("failed")) return "failed";
  return "not_found";
}

/**
 * The pool a practice run draws from (PRD §3.3.1): one category's pack, or
 * for Mixed every pack that loads. Mixed plays from whatever is available,
 * so an offline device with a few packs cached still gets a run; it fails
 * only when no pack loads at all.
 */
export async function loadPracticePool(
  category: CategoryId | "mixed",
): Promise<LoadResult<PracticeItem[]>> {
  if (category !== "mixed") {
    const pack = await loadPracticePack(category);
    return pack.ok ? { ok: true, value: pack.value.items } : pack;
  }
  const packs = await Promise.all(CATEGORY_IDS.map(loadPracticePack));
  const items = packs.flatMap((pack) => (pack.ok ? pack.value.items : []));
  if (items.length > 0) return { ok: true, value: items };
  return {
    ok: false,
    error: worstError(packs.flatMap((pack) => (pack.ok ? [] : [pack.error]))),
  };
}
