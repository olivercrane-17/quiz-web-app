/**
 * The share glyphs (DESIGN §6.11): 🟥 a clue passed, ✅ the clue that solved
 * it, ⬜ a clue never needed, and 🎯 inside the Encore's bullseye band; the
 * high-contrast set swaps in 🟧 and 🟦. DESIGN.md sets no glyphs for choice
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
  bullseye: string;
}

export const DEFAULT_GLYPHS: GlyphSet = {
  cells: {
    passed: "🟥",
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
