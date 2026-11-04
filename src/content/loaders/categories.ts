/**
 * The 12 categories (ARCHITECTURE §2.3, §3.2), from the generated module
 * the content build writes from content/categories.json. Final
 * signatures. Both content worlds share them: the fixture tree has no
 * categories of its own.
 */
import type { Category, CategoryId } from "@/engine/types";

import { CATEGORIES } from "../generated/categories";

const SORTED: readonly Category[] = Object.freeze(
  [...CATEGORIES].sort((a, b) => a.order - b.order),
);

/** Every category, in display order. */
export function getCategories(): readonly Category[] {
  return SORTED;
}

export function categoryById(id: CategoryId): Category | null {
  return SORTED.find((category) => category.id === id) ?? null;
}

export function categoryBySlug(slug: string): Category | null {
  return SORTED.find((category) => category.slug === slug) ?? null;
}
