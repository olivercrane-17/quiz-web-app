/**
 * The share glyphs (DESIGN §6.11 with decision D3 of the RITE round 1
 * memo): 🟧 a clue used before the solve, whether by a wrong guess or by
 * Next clue (they cost the same, so the share no longer tells them apart,
 * and nothing is painted red), ✅ the clue that solved it, ⬜ a clue never
 * needed, and 🎯 inside the Encore's bullseye band. A miss is 🟧🟧🟧🟧. The
 * high-contrast set already drew a used clue 🟧, so it keeps 🟧 and 🟦.
 * DESIGN.md sets no glyphs for choice rounds yet, so they reuse ✅ (right)
 * and 🟥 (not right), and a voided question shows ⬜.
 *
 * A greybox copy kept import-free, so the home card's mini grid costs a few
 * bytes. SHR-1 moves the sets to `src/features/share/glyphs.ts`, which
 * DESIGN.md owns, and the Daily then imports them from there.
 */
import type { ShareCell } from "@/engine/types";

export interface GlyphSet {
  cells: Readonly<Record<ShareCell, string>>;
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
  bullseye: "🎯",
};

/** The player's set: high contrast when that setting is on (DESIGN §6.11). */
export function glyphsFor(highContrast: boolean): GlyphSet {
  return highContrast ? HIGH_CONTRAST_GLYPHS : DEFAULT_GLYPHS;
}
