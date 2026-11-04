/**
 * Practice packs (ARCHITECTURE §2.3, §5.3). Final signatures; PRA-1 builds
 * practice on them. Each category's pack is a hashed file the content
 * build writes under public/content/packs/, named in the generated
 * manifest, fetched the first time a run needs it and cached by the
 * service worker (§10.7), so no route carries practice items in its first
 * load. A mock build plays the fixture world's packs instead (world.ts).
 */
import {
  CATEGORY_IDS,
  type CategoryId,
  type PracticeItem,
} from "@/engine/types";

import type { LoadError, LoadResult, PracticePack } from "../types";
import { bankPack } from "./bank";
import { fixtureWorldPack } from "./fixture-world";
import { contentWorld } from "./world";

/** One category's practice pack. */
export async function loadPracticePack(
  category: CategoryId,
): Promise<LoadResult<PracticePack>> {
  try {
    if (contentWorld() === "fixtures") {
      const pack = await fixtureWorldPack(category);
      return pack === null
        ? { ok: false, error: "not_found" }
        : { ok: true, value: pack };
    }
    return await bankPack(category);
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
