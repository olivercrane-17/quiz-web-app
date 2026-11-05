/**
 * The share glyphs (DESIGN §6.11 with decisions D3 and D22 of the RITE
 * memo): 🟧 a clue used before the solve, whether by a wrong guess or by
 * Next clue (they cost the same, so the share doesn't tell them apart, and
 * nothing is painted red), ✅ the clue that solved it, ⬜ a clue never
 * needed, and 🎯 inside the Encore's bullseye band. A miss ends in ❌,
 * 🟧🟧🟧❌, so it never reads as "used every clue" (D22, R2-09). The
 * high-contrast set already drew a used clue 🟧, so it keeps 🟧 and 🟦, and
 * it keeps ❌, which reads by its shape. DESIGN.md sets no glyphs for choice
 * rounds yet, so they reuse ✅ (right) and 🟥 (not right), and a voided
 * question shows ⬜.
 *
 * A greybox copy kept import-free, so the home card's mini grid costs a few
 * bytes. SHR-1 moves the sets to `src/features/share/glyphs.ts`, which
 * DESIGN.md owns, and the Daily then imports them from there.
 */
import type { ShareCell } from "@/engine/types";

export interface GlyphSet {
  cells: Readonly<Record<ShareCell, string>>;
  /** The last square of a missed Mystery's row (D22). */
  missed: string;
  bullseye: string;
}

export const DEFAULT_GLYPHS: GlyphSet = {
  cells: {
    passed: "🟧",
    solved: "✅",
    unused: "⬜",
    voided: "⬜",
    correct: "✅",
    wrong: "🟥",
  },
  missed: "❌",
  bullseye: "🎯",
};

export const HIGH_CONTRAST_GLYPHS: GlyphSet = {
  cells: {
    passed: "🟧",
    solved: "🟦",
    unused: "⬜",
    voided: "⬜",
    correct: "🟦",
    wrong: "🟧",
  },
  missed: "❌",
  bullseye: "🎯",
};

/** The player's set: high contrast when that setting is on (DESIGN §6.11). */
export function glyphsFor(highContrast: boolean): GlyphSet {
  return highContrast ? HIGH_CONTRAST_GLYPHS : DEFAULT_GLYPHS;
}

/**
 * One row of the mini grid, as the share text draws it: a row of passed
 * cells alone is a missed Mystery, so it ends in ❌ (D22); every other row,
 * a Mystery's or a run of questions', draws cell by cell. The engine's
 * `drawMysteryCells` has the same rule for the share text, and a test keeps
 * the two together; this copy keeps the home card free of engine code.
 */
export function drawGridRow(
  cells: readonly ShareCell[],
  glyphs: GlyphSet,
): string {
  const drawn = cells.map((cell) => glyphs.cells[cell]);
  const missed = cells.length > 0 && cells.every((cell) => cell === "passed");
  if (missed) drawn[drawn.length - 1] = glyphs.missed;
  return drawn.join("");
}
