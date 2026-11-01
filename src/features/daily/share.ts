/**
 * The Daily's share text and payload for the stop screen (PRD §3.5.1,
 * DESIGN §6.11), built by the engine's share module from the finished
 * attempt: the brand, the category short names, the glyph set the player's
 * high-contrast setting picks, and a link to `/daily` on our origin until
 * ENG-2's share codes give it `/s/{number}/{code}` (SHR-1).
 */
import { getCategories } from "@/content/loaders/categories";
import { buildDailyShareText, shareGrid } from "@/engine/share/text";
import type { AttemptSnapshot, CategoryId, ShareCell } from "@/engine/types";
import type { SharePayload } from "@/features/share/share-button";

import { DEFAULT_GLYPHS, HIGH_CONTRAST_GLYPHS } from "./glyphs";

/** The product name, first on line 1 (DESIGN §0.2). */
export const BRAND = "Knewt";
/** The label of a row of collapsed choice rounds; DESIGN.md hasn't set one yet. */
export const CHOICE_ROW_LABEL = "Questions";

const SHORT_NAMES: ReadonlyMap<CategoryId, string> = new Map(
  getCategories().map((category) => [category.id, category.shortName]),
);

export function categoryShortName(id: CategoryId): string {
  return SHORT_NAMES.get(id) ?? id;
}

function outcomesOf(attempt: AttemptSnapshot) {
  return [...attempt.resolved]
    .sort((a, b) => a.meta.index - b.meta.index)
    .map((round) => round.outcome);
}

/** The exact text the player shares: path-only link last, never an answer. */
export function dailyShareText(
  attempt: AttemptSnapshot,
  options: { siteUrl: string; highContrast: boolean },
): string {
  return buildDailyShareText({
    brand: BRAND,
    dailyNumber: attempt.daily?.dailyNumber ?? 0,
    archive: attempt.kind === "archive",
    points: attempt.points,
    maxPoints: attempt.maxPoints,
    outcomes: outcomesOf(attempt),
    glyphs: options.highContrast ? HIGH_CONTRAST_GLYPHS : DEFAULT_GLYPHS,
    labels: {
      category: categoryShortName,
      choiceRow: CHOICE_ROW_LABEL,
      voided: "voided",
    },
    link: `${options.siteUrl.replace(/\/+$/, "")}/daily`,
  });
}

/** The player's own rows, for the Share button's mini grid. */
export function dailyGrid(attempt: AttemptSnapshot): ShareCell[][] {
  return shareGrid(outcomesOf(attempt));
}

export function dailySharePayload(
  attempt: AttemptSnapshot,
  options: { siteUrl: string; highContrast: boolean },
): SharePayload {
  return {
    text: dailyShareText(attempt, options),
    mode: attempt.kind === "archive" ? "archive" : "daily",
    grid: dailyGrid(attempt),
  };
}
