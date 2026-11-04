/**
 * Practice packs (ARCHITECTURE §2.3, §5.3). Final signatures; PRA-1 builds
 * practice on them. Each category's pack is a hashed file the content
 * build writes under public/content/packs/, named in the generated
 * manifest, fetched the first time a run needs it and cached by the
 * service worker (§10.7), so no route carries practice items in its first
 * load. A mock build plays the fixture world's packs instead (world.ts),
 * whose decoder loads with them, so no other build carries it.
 */
import {
  CATEGORY_IDS,
  type CategoryId,
  type PracticeItem,
} from "@/engine/types";

import type { LoadError, LoadResult, PracticePack } from "../types";
import { bankPack } from "./bank";
import { contentWorld } from "./world";

/** One category's practice pack. */
export async function loadPracticePack(
  category: CategoryId,
): Promise<LoadResult<PracticePack>> {
  try {
    if (contentWorld() === "fixtures") {
      const { fixtureWorldPack } = await import("./fixture-world");
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
 * Mixed starts once this many packs have loaded: the first question
 * renders as soon as packs to draw it from arrive (PRD §3.3.1, §8.1),
 * instead of after all twelve.
 */
export const MIXED_QUORUM = 4;

/**
 * Once the quorum is in, packs already on their way get this long to
 * join, so a warm service worker (every pack a few milliseconds away) still
 * gives Mixed all twelve.
 */
export const MIXED_GRACE_MS = 50;

/**
 * The pool a practice run draws from (PRD §3.3.1): one category's pack, or
 * for Mixed the packs that have loaded once MIXED_QUORUM of them have (or
 * every fetch has settled). The other fetches keep running and fill the
 * tab's cache (bank.ts), so the next run has them. Mixed plays from
 * whatever is available, so an offline device with a few packs cached
 * still gets a run; it fails only when no pack loads at all.
 */
export function loadPracticePool(
  category: CategoryId | "mixed",
): Promise<LoadResult<PracticeItem[]>> {
  if (category !== "mixed") {
    return loadPracticePack(category).then((pack) =>
      pack.ok ? { ok: true, value: pack.value.items } : pack,
    );
  }
  return new Promise((resolve) => {
    const loaded = new Map<CategoryId, PracticeItem[]>();
    const errors: LoadError[] = [];
    let settled = 0;
    let done = false;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (grace !== null) clearTimeout(grace);
      // Category order, whichever pack arrived first.
      const items = CATEGORY_IDS.flatMap((id) => loaded.get(id) ?? []);
      resolve(
        items.length > 0
          ? { ok: true, value: items }
          : { ok: false, error: worstError(errors) },
      );
    };
    for (const id of CATEGORY_IDS) {
      void loadPracticePack(id).then((pack) => {
        settled += 1;
        if (pack.ok) loaded.set(id, pack.value.items);
        else errors.push(pack.error);
        if (settled === CATEGORY_IDS.length) finish();
        else if (loaded.size >= MIXED_QUORUM && grace === null && !done)
          grace = setTimeout(finish, MIXED_GRACE_MS);
      });
    }
  });
}
