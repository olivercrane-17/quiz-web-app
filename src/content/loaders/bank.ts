/**
 * The real bank on the CDN (ARCHITECTURE §5.3, D12): every practice pack
 * and answer list is a hashed static JSON file under /content/, named in
 * the generated manifest. A URL changes whenever its file does, so the
 * service worker serves them cache-first (§10.7) and a fetch here meets the
 * network only on a first visit or after a deploy changed the file.
 *
 * Successful loads are kept for the tab; a failed one is forgotten, so
 * asking again retries it.
 */
import type { AnswerList, AnswerType, CategoryId } from "@/engine/types";

import { ANSWER_LISTS, PRACTICE_PACKS } from "../generated/manifest";
import type { LoadError, LoadResult, PracticePack } from "../types";
import { decodeListFile, decodePackFile } from "./wire";

function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function fetchJson(url: string): Promise<LoadResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin" });
  } catch {
    // Not in the cache and no network, or the network dropped.
    return { ok: false, error: offline() ? "offline" : "failed" };
  }
  if (!response.ok) return { ok: false, error: "failed" };
  try {
    return { ok: true, value: (await response.json()) as unknown };
  } catch {
    return { ok: false, error: "failed" };
  }
}

function cached<K, T>(
  cache: Map<K, Promise<LoadResult<T>>>,
  key: K,
  load: () => Promise<LoadResult<T>>,
): Promise<LoadResult<T>> {
  let pending = cache.get(key);
  if (pending === undefined) {
    pending = load().then(
      (result) => {
        if (!result.ok) cache.delete(key);
        return result;
      },
      () => {
        cache.delete(key);
        return { ok: false, error: "failed" as LoadError };
      },
    );
    cache.set(key, pending);
  }
  return pending;
}

const packs = new Map<CategoryId, Promise<LoadResult<PracticePack>>>();
const lists = new Map<AnswerType, Promise<LoadResult<AnswerList>>>();

/** One category's pack from the bank. */
export function bankPack(
  category: CategoryId,
): Promise<LoadResult<PracticePack>> {
  const entry = PRACTICE_PACKS[category];
  if (entry === undefined)
    return Promise.resolve({ ok: false, error: "not_found" });
  return cached(packs, category, async () => {
    const fetched = await fetchJson(entry.url);
    if (!fetched.ok) return fetched;
    try {
      return { ok: true, value: decodePackFile(fetched.value, category) };
    } catch {
      return { ok: false, error: "failed" };
    }
  });
}

/** One answer list from the bank, as the client projection. */
export function bankList(type: AnswerType): Promise<LoadResult<AnswerList>> {
  const entry = ANSWER_LISTS[type];
  if (entry === undefined)
    return Promise.resolve({ ok: false, error: "not_found" });
  return cached(lists, type, async () => {
    const fetched = await fetchJson(entry.url);
    if (!fetched.ok) return fetched;
    try {
      return { ok: true, value: decodeListFile(fetched.value, type) };
    } catch {
      return { ok: false, error: "failed" };
    }
  });
}

/** Tests only: forgets every loaded pack and list. */
export function resetBankForTests(): void {
  packs.clear();
  lists.clear();
}
