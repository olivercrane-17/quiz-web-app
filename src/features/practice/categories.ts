/**
 * Category names for the practice screens. The route modules build them on
 * the server from the content loader and hand them to their client islands
 * as props, so the islands carry neither content/categories.json nor its
 * decoder in their chunks.
 */
import type { Category, CategoryId } from "@/engine/types";

export interface PracticeCategoryLabel {
  /** "Science & Tech": the header and the notes. */
  name: string;
  /** "science-tech": analytics (PRD §7.2 `practice_start.category`). */
  slug: string;
}

export type PracticeCategoryLabels = Readonly<
  Partial<Record<CategoryId, PracticeCategoryLabel>>
>;

export function practiceCategoryLabels(
  categories: readonly Category[],
): PracticeCategoryLabels {
  return Object.fromEntries(
    categories.map((category) => [
      category.id,
      { name: category.name, slug: category.slug },
    ]),
  );
}

export function categorySlugs(
  labels: PracticeCategoryLabels,
): Partial<Record<CategoryId, string>> {
  return Object.fromEntries(
    Object.entries(labels).map(([id, label]) => [id, label.slug]),
  );
}
