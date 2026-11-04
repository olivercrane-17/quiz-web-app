/**
 * The Daily's share text (ARCHITECTURE §4.10, PRD §3.5.1, DESIGN §6.11):
 * text first and the link last, no answers, no clue text, no percentile,
 * streak or time.
 *
 *   Knewt Daily #42 · 9/12 · Encore off by 4% 🎯
 *   Geography ✅⬜⬜⬜
 *   Film & TV 🟧✅⬜⬜
 *   Science & Tech 🟧🟧✅⬜
 *   https://knewt.app/daily
 *
 * - Line 1: the brand, "Daily #N" (" (archive)" after it for archive plays),
 *   the score out of the Daily's maximum, and the Encore token ("Encore off
 *   by 4%", "Encore off by 3 years", "Encore spot on": decision D4, which
 *   keeps the in-app "4% off") with the bullseye glyph inside the bullseye
 *   band. A Daily with no Encore, or a voided one, has no token. No-break
 *   spaces sit inside "Daily #42" and the Encore token, so a narrow chat
 *   bubble breaks between tokens, never inside one.
 * - One row per Mystery: the category's short name, a space, then four
 *   glyphs; a voided Mystery reads "History · voided", in words only. A
 *   wrong guess and Next clue cost the same, so both are one *passed* cell
 *   (decision D3), which the glyph sets draw as a used clue, never red.
 * - Consecutive choice rounds collapse into one row, one glyph per question
 *   (`[mc ×9, encore]` shares one row of nine, AC-DLY-09).
 * - The link is the last line, path-only on our origin. Until ENG-2's share
 *   codes exist it is `/daily`; SHR-1 owns this file from Wave 12 and
 *   switches it to `/s/{number}/{code}`.
 *
 * Glyphs and labels come in as data (the glyph sets are DESIGN.md's, in
 * the feature layer), so the bytes can change without touching the rules.
 */
import type { CategoryId } from "../types/content.ts";
import type { RoundOutcome, ShareCell } from "../types/rounds.ts";

/** What each share cell looks like, and the bullseye mark. */
export interface ShareGlyphs {
  cells: Readonly<Record<ShareCell, string>>;
  bullseye: string;
}

export interface ShareLabels {
  /** A Mystery row's label: the category's short name ("Film & TV"). */
  category(id: CategoryId): string;
  /** The label of a row of collapsed choice rounds. */
  choiceRow: string;
  /** What a voided Mystery's row says after its label ("voided"). */
  voided: string;
}

/** One row of the share grid, before glyphs. */
export type ShareRow =
  | {
      kind: "mystery";
      category: CategoryId;
      cells: ShareCell[];
      voided: boolean;
    }
  | { kind: "choice"; cells: ShareCell[] };

/**
 * The grid's rows, in round order: one per Mystery, one per run of
 * consecutive choice rounds, none for the Encore.
 */
export function shareRows(outcomes: readonly RoundOutcome[]): ShareRow[] {
  const rows: ShareRow[] = [];
  let choices: ShareCell[] | null = null;
  for (const outcome of outcomes) {
    if (outcome.family === "choice") {
      if (choices === null) {
        choices = [];
        rows.push({ kind: "choice", cells: choices });
      }
      choices.push(...outcome.cells);
      continue;
    }
    choices = null;
    if (outcome.family === "mystery") {
      rows.push({
        kind: "mystery",
        category: outcome.category,
        cells: [...outcome.cells],
        voided: outcome.voided,
      });
    }
  }
  return rows;
}

/** The rows as cells alone: the mini grid, and `DailyTodayCard.finished.rows`. */
export function shareGrid(outcomes: readonly RoundOutcome[]): ShareCell[][] {
  return shareRows(outcomes).map((row) => [...row.cells]);
}

const NBSP = " ";

const keepTogether = (text: string) => text.replace(/ /g, NBSP);

const OFF = / off$/;

/**
 * The error's display as the share token reads it (decision D4): "4% off"
 * becomes "off by 4%", "under 1% off" "off by under 1%", "3 years off"
 * "off by 3 years", so line 1 never reads like a sale; "Spot on" becomes
 * "spot on". The in-app result keeps the display as it is.
 */
export function shareErrorWords(display: string): string {
  if (OFF.test(display)) return `off by ${display.replace(OFF, "")}`;
  return display.length === 0
    ? display
    : `${display.charAt(0).toLowerCase()}${display.slice(1)}`;
}

/** The Encore's part of line 1, or null when the Daily has no scored Encore. */
export function encoreToken(
  outcomes: readonly RoundOutcome[],
  glyphs: ShareGlyphs,
): string | null {
  const encore = outcomes.find(
    (outcome): outcome is Extract<RoundOutcome, { family: "encore" }> =>
      outcome.family === "encore",
  );
  if (encore === undefined || encore.voided || encore.error === null) {
    return null;
  }
  const token = keepTogether(`Encore ${shareErrorWords(encore.error.display)}`);
  return encore.band === "bullseye" ? `${token} ${glyphs.bullseye}` : token;
}

/** The words of the grid's legend, one per Mystery cell. */
export interface ShareLegendWords {
  passed: string;
  solved: string;
  unused: string;
}

/**
 * The one-line legend under the stop screen's grid (decision D3), in the
 * player's glyph set: "🟧 clue used · ✅ solved · ⬜ not needed". Null for
 * a grid with no Mystery row it could explain (a choice-only Daily, or
 * Mysteries that were all withdrawn, whose rows are in words).
 */
export function shareLegend(
  rows: readonly ShareRow[],
  glyphs: ShareGlyphs,
  words: ShareLegendWords,
): string | null {
  const explains = rows.some((row) => row.kind === "mystery" && !row.voided);
  if (!explains) return null;
  return (["passed", "solved", "unused"] as const)
    .map((cell) => `${glyphs.cells[cell]} ${words[cell]}`)
    .join(" · ");
}

export interface DailyShareInput {
  /** The product name, first on line 1. */
  brand: string;
  dailyNumber: number;
  archive: boolean;
  points: number;
  maxPoints: number;
  /** Every round's outcome, in round order. */
  outcomes: readonly RoundOutcome[];
  glyphs: ShareGlyphs;
  labels: ShareLabels;
  /** The last line: an absolute URL whose path carries no query or fragment. */
  link: string;
}

/** Line 1: "Knewt Daily #42 · 9/12 · Encore 4% off 🎯". */
export function shareHeadline(input: DailyShareInput): string {
  const daily = keepTogether(`Daily #${input.dailyNumber}`);
  const parts = [
    `${input.brand} ${daily}${input.archive ? " (archive)" : ""}`,
    `${input.points}/${input.maxPoints}`,
  ];
  const encore = encoreToken(input.outcomes, input.glyphs);
  if (encore !== null) parts.push(encore);
  return parts.join(" · ");
}

/** The grid's lines, one per row, words first. */
export function shareRowLines(
  rows: readonly ShareRow[],
  glyphs: ShareGlyphs,
  labels: ShareLabels,
): string[] {
  const draw = (cells: readonly ShareCell[]) =>
    cells.map((cell) => glyphs.cells[cell]).join("");
  return rows.map((row) => {
    if (row.kind === "choice") return `${labels.choiceRow} ${draw(row.cells)}`;
    const label = labels.category(row.category);
    return row.voided
      ? `${label} · ${labels.voided}`
      : `${label} ${draw(row.cells)}`;
  });
}

/** The whole text, lines joined with "\n", the link last. */
export function buildDailyShareText(input: DailyShareInput): string {
  return [
    shareHeadline(input),
    ...shareRowLines(shareRows(input.outcomes), input.glyphs, input.labels),
    input.link,
  ].join("\n");
}
