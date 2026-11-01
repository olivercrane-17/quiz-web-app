/**
 * Display order for choice options (ARCHITECTURE §4.4.1, PRD §3.3.2, AC-PRA-04).
 *
 * The order is decided once, when the round opens, and is a permutation of
 * source indices: position `i` on screen shows `options[order[i]]`.
 *
 * - `shuffle`: the order stored for the round (sealed play draws it in SQL
 *   and stores it per attempt), else a shuffle from the round's rng.
 * - `ascending`: numbers and dates sorted by sortKey (§4.12), smallest
 *   first, equal keys in source order. A set that can't be sorted is a
 *   content error the lint refuses; it falls back to a shuffle, never to
 *   source order, because source order puts a multiple-choice key first.
 * - `fixed`: source order. True/false is always fixed (True, then False).
 * - Comparisons always shuffle, whatever the item says, so the key's side
 *   never leaks.
 */
import type { Rng } from "../../rng.ts";
import { ascendingOrder } from "../../text/metrics.ts";
import type { ChoiceItem } from "../../types/content.ts";

export type OrderedContent = Pick<ChoiceItem, "format" | "options" | "order">;

function identity(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/** True when `order` holds each of 0 .. count - 1 exactly once. */
export function isPermutation(
  order: readonly number[],
  count: number,
): boolean {
  if (order.length !== count) return false;
  const seen = new Set<number>();
  for (const value of order) {
    if (!Number.isInteger(value) || value < 0 || value >= count) return false;
    if (seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

function storedOrShuffled(
  count: number,
  rng: Rng,
  stored: readonly number[] | null,
): number[] {
  if (stored !== null && isPermutation(stored, count)) return [...stored];
  return rng.shuffle(identity(count));
}

/**
 * The display order of an item's options. `stored` is the sealed layer's
 * order for the round, used for shuffled items only.
 */
export function choiceDisplayOrder(
  content: OrderedContent,
  rng: Rng,
  stored: readonly number[] | null = null,
): number[] {
  const count = content.options.length;
  if (content.format === "tf") return identity(count);
  if (content.format === "comparison") {
    return storedOrShuffled(count, rng, stored);
  }
  switch (content.order) {
    case "fixed":
      return identity(count);
    case "ascending":
      return ascendingOrder(content.options) ?? rng.shuffle(identity(count));
    case "shuffle":
      return storedOrShuffled(count, rng, stored);
  }
}
