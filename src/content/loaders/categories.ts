/**
 * The 12 categories (ARCHITECTURE §2.3, §3.2), from content/categories.json.
 * Final signature; CNT-1 switches it to the generated categories module.
 */
import type { Category, CategoryId } from "@/engine/types";

import raw from "../../../content/categories.json";
import { decodeCategories } from "./fixtures/decode";

const CATEGORIES: readonly Category[] = Object.freeze(
  decodeCategories(raw, "content/categories.json").sort(
    (a, b) => a.order - b.order,
  ),
);

/** Every category, in display order. */
export function getCategories(): readonly Category[] {
  return CATEGORIES;
}

export function categoryById(id: CategoryId): Category | null {
  return CATEGORIES.find((category) => category.id === id) ?? null;
}

export function categoryBySlug(slug: string): Category | null {
  return CATEGORIES.find((category) => category.slug === slug) ?? null;
}
