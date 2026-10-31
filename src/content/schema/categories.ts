/**
 * The twelve categories (CONTENT_GUIDE §1). content/categories.json carries
 * the ARCHITECTURE §3.2 `Category` fields only; the guide's per-category
 * rules the tooling needs live here as constants.
 */
import { z } from "zod";

import {
  CATEGORY_CODES,
  type AnswerType,
  type CategoryCode,
  type PackId,
  categoryCode,
  text,
} from "./primitives.ts";

export const CategorySchema = z.strictObject({
  id: categoryCode,
  slug: z
    .string()
    .regex(/^[a-z]+(?:-[a-z]+)*$/, "slugs are lowercase kebab-case"),
  name: text,
  shortName: text,
  order: z.int().min(1).max(12),
});
export type Category = z.infer<typeof CategorySchema>;

export const CategoriesFileSchema = z
  .array(CategorySchema)
  .length(12)
  .superRefine((categories, ctx) => {
    for (const key of ["id", "slug", "order"] as const) {
      const values = categories.map((category) => category[key]);
      values.forEach((value, index) => {
        if (values.indexOf(value) !== index) {
          ctx.addIssue({
            code: "custom",
            path: [index, key],
            message: `duplicate ${key} ${String(value)}`,
          });
        }
      });
    }
  });

/** The §1 table, in order. */
export const CATEGORY_TABLE: readonly Category[] = [
  {
    id: "geo",
    slug: "geography",
    name: "Geography",
    shortName: "Geography",
    order: 1,
  },
  {
    id: "hist",
    slug: "history",
    name: "History",
    shortName: "History",
    order: 2,
  },
  {
    id: "sci",
    slug: "science-tech",
    name: "Science & Tech",
    shortName: "Science & Tech",
    order: 3,
  },
  {
    id: "nat",
    slug: "nature-animals",
    name: "Nature & Animals",
    shortName: "Nature",
    order: 4,
  },
  {
    id: "film",
    slug: "film-tv",
    name: "Film & TV",
    shortName: "Film & TV",
    order: 5,
  },
  { id: "music", slug: "music", name: "Music", shortName: "Music", order: 6 },
  {
    id: "art",
    slug: "art-design",
    name: "Art & Design",
    shortName: "Art & Design",
    order: 7,
  },
  {
    id: "book",
    slug: "books-literature",
    name: "Books & Literature",
    shortName: "Books",
    order: 8,
  },
  {
    id: "sport",
    slug: "sport-games",
    name: "Sport & Games",
    shortName: "Sport & Games",
    order: 9,
  },
  {
    id: "food",
    slug: "food-drink",
    name: "Food & Drink",
    shortName: "Food & Drink",
    order: 10,
  },
  {
    id: "lang",
    slug: "language-words",
    name: "Language & Words",
    shortName: "Words",
    order: 11,
  },
  {
    id: "soc",
    slug: "society-culture",
    name: "Society & Culture",
    shortName: "Society",
    order: 12,
  },
];

/**
 * Mystery answer types per category (§1 table). Language & Words may use
 * any type when the clues are about names and words (§1.13).
 */
export const MYSTERY_ANSWER_TYPES: Record<
  CategoryCode,
  readonly AnswerType[] | "any"
> = {
  geo: ["country", "city", "landmark"],
  hist: ["person", "country", "city", "landmark"],
  sci: ["element", "person"],
  nat: ["animal", "landmark"],
  film: ["film", "tv_series", "person"],
  music: ["music_artist", "city"],
  art: ["person", "landmark"],
  book: ["book", "person"],
  sport: ["sport", "person", "city", "country"],
  food: ["dish", "country", "city"],
  lang: "any",
  soc: ["person", "country", "city", "landmark", "sport", "dish"],
};

/** The eight room packs and their category mix (§10.9). */
export const PACK_TABLE: Record<
  PackId,
  {
    title: string;
    theme: string;
    categories: Partial<Record<CategoryCode, number>>;
  }
> = {
  "around-the-world": {
    title: "Around the World",
    theme: "Places, landmarks, customs and festivals",
    categories: { geo: 12, soc: 3 },
  },
  "back-in-time": {
    title: "Back in Time",
    theme: "Empires and turning points",
    categories: { hist: 12, art: 3 },
  },
  "screen-time": {
    title: "Screen Time",
    theme: "Films and TV from everywhere",
    categories: { film: 15 },
  },
  "sound-check": {
    title: "Sound Check",
    theme: "Songs, bands, composers and instruments",
    categories: { music: 15 },
  },
  "wild-things": {
    title: "Wild Things",
    theme: "Animals and plants",
    categories: { nat: 15 },
  },
  "kitchen-table": {
    title: "Kitchen Table",
    theme: "Food and drink, and the words for them",
    categories: { food: 12, lang: 3 },
  },
  "game-on": {
    title: "Game On",
    theme: "Sports and games played worldwide",
    categories: { sport: 15 },
  },
  "all-sorts": {
    title: "All Sorts",
    theme: "General knowledge across the rest",
    categories: { sci: 3, book: 3, art: 3, lang: 3, soc: 3 },
  },
};

export function isCategoryCode(value: string): value is CategoryCode {
  return (CATEGORY_CODES as readonly string[]).includes(value);
}
