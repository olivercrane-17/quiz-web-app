/**
 * The Daily's share text and payload for the stop screen and the finished
 * home card (PRD §3.5.1, DESIGN §6.11), built by the engine's share module
 * from the finished attempt: the brand, the category short names, the
 * glyph set the player's high-contrast setting picks, and a link to Today
 * on our origin until SHR-1's landing gives it `/s/{number}/{code}`. Both
 * surfaces build it here, so they share the same text (AC-SHR-11) and the
 * same origin, `getSiteUrl()`.
 */
import { getCategories } from "@/content/loaders/categories";
import {
  buildDailyShareText,
  shareGrid,
  shareLegend,
  shareRows,
} from "@/engine/share/text";
import type { AttemptSnapshot, CategoryId, ShareCell } from "@/engine/types";
import type { SharePayload } from "@/features/share/share-button";
import { getSiteUrl } from "@/lib/env";

import { STOP_SCREEN_COPY } from "./client-copy";
import { glyphsFor } from "./glyphs";

/** The product name, first on line 1 (DESIGN §0.2). */
export const BRAND = "Knewt";
/** The label of a row of collapsed choice rounds; DESIGN.md hasn't set one yet. */
export const CHOICE_ROW_LABEL = "Questions";
/**
 * The path the share link opens: Today, until SHR-1's `/s/{number}/{code}`
 * landing exists (RITE round 2, R2-20). Flow 5.1 starts a friend on a
 * landing, never on clue 1: `/daily` started the Daily and its stopwatch
 * before Lena knew what she was looking at, and she never saw Today's card.
 * Path-only, with no query string or fragment (PRD §3.5.1).
 */
export const SHARE_PATH = "/";

const SHORT_NAMES: ReadonlyMap<CategoryId, string> = new Map(
  getCategories().map((category) => [category.id, category.shortName]),
);

export function categoryShortName(id: CategoryId): string {
  return SHORT_NAMES.get(id) ?? id;
}

/** The share rows' words: the category short names, the choice row and a void. */
export const SHARE_LABELS = {
  category: categoryShortName,
  choiceRow: CHOICE_ROW_LABEL,
  voided: "voided",
} as const;

function outcomesOf(attempt: AttemptSnapshot) {
  return [...attempt.resolved]
    .sort((a, b) => a.meta.index - b.meta.index)
    .map((round) => round.outcome);
}

export interface ShareOptions {
  highContrast: boolean;
  /** Our origin; `getSiteUrl()` unless a test passes another. */
  siteUrl?: string;
}

/** The share text's last line: our origin plus a path, never a query (PRD §3.5.1). */
export function dailyShareLink(siteUrl: string = getSiteUrl()): string {
  return `${siteUrl.replace(/\/+$/, "")}${SHARE_PATH}`;
}

/** The exact text the player shares: path-only link last, never an answer. */
export function dailyShareText(
  attempt: AttemptSnapshot,
  options: ShareOptions,
): string {
  return buildDailyShareText({
    brand: BRAND,
    dailyNumber: attempt.daily?.dailyNumber ?? 0,
    archive: attempt.kind === "archive",
    points: attempt.points,
    maxPoints: attempt.maxPoints,
    outcomes: outcomesOf(attempt),
    glyphs: glyphsFor(options.highContrast),
    labels: SHARE_LABELS,
    link: dailyShareLink(options.siteUrl),
  });
}

/** The player's own rows, for the Share button's mini grid. */
export function dailyGrid(attempt: AttemptSnapshot): ShareCell[][] {
  return shareGrid(outcomesOf(attempt));
}

/**
 * The stop screen's one-line legend under its grid (decision D3), in the
 * player's glyph set, or null when the grid has no Mystery row.
 */
export function dailyLegend(
  attempt: AttemptSnapshot,
  highContrast: boolean,
): string | null {
  return shareLegend(
    shareRows(outcomesOf(attempt)),
    glyphsFor(highContrast),
    STOP_SCREEN_COPY.legend,
  );
}

export function dailySharePayload(
  attempt: AttemptSnapshot,
  options: ShareOptions,
): SharePayload {
  return {
    text: dailyShareText(attempt, options),
    mode: attempt.kind === "archive" ? "archive" : "daily",
    grid: dailyGrid(attempt),
  };
}
