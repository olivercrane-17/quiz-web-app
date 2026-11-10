/**
 * The round's kicker and category chip (PRD §3.1.4, DESIGN §5 pips, §12.2):
 * "Mystery 2 of 3 · ●●○ Medium" above the clue screen, and "Mystery 2 of 3
 * · History · a person" above the reveal. Difficulty pips go from sparse
 * to dense and are always followed by the word, so they read without
 * colour; the pips themselves are decorative.
 *
 * The parts wrap as whole pieces, and the dot between two parts sits in the
 * gap before the second, so when a part starts a new line its dot falls
 * outside the kicker's box, which clips it: no line starts or ends on a
 * lone dot (R1-33).
 *
 * Screen readers hear the parts joined by commas, as one string, "Mystery 1
 * of 3, Easy", with no stray separators (R3-09). The drawn parts are hidden
 * from them: each is a flex item, and assistive tech puts a space at every
 * block-level box (a flex item, or a visually hidden span, which is
 * absolutely positioned), so commas placed among the parts read "Mystery 1
 * of 3 , Easy" whichever part held them. The dot is drawn as generated
 * content with empty alternative text (`content: "·" / ""`), so it is in no
 * copied or read-aloud text either.
 */
import type { ReactNode } from "react";

import { categoryById } from "@/content/loaders/categories";
import type { DifficultyBand, RoundMeta } from "@/engine/types";
import { cx } from "@/ui/cx";

import { MYSTERY_COPY, answerWords } from "./copy";
import { TONE } from "./tones";

/** "Mystery 2 of 3", or "Mystery" when the run has just the one. */
export function roundLabel(meta: RoundMeta): string {
  return meta.ofType > 1
    ? MYSTERY_COPY.roundLabel(meta.ordinal, meta.ofType)
    : MYSTERY_COPY.kicker.single;
}

export function categoryName(meta: RoundMeta): string | null {
  return meta.category === null
    ? null
    : (categoryById(meta.category)?.name ?? null);
}

const PIPS: Readonly<Record<DifficultyBand, number>> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export function Pips({ difficulty }: { difficulty: DifficultyBand }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-[3px]">
      {[1, 2, 3].map((n) => (
        <i
          key={n}
          className={cx(
            "size-[7px] rounded-full border-[1.5px] border-current",
            n <= PIPS[difficulty] && "bg-current",
          )}
        />
      ))}
    </span>
  );
}

/** One drawn part of the kicker after the first, with its dot in the gap before it. */
function Part({ children }: { children: ReactNode }) {
  return (
    // A part that wraps inside itself starts its own line, at the box's edge.
    <span aria-hidden="true" data-kicker-part="" className="relative min-w-0">
      <span
        data-kicker-dot=""
        className="absolute top-0 right-full mr-[0.42em] before:content-['·'_/_'']"
      />
      {children}
    </span>
  );
}

/** What the kicker says to assistive tech: its parts, joined by commas (R3-09). */
export function kickerText(parts: readonly string[]): string {
  return parts.join(", ");
}

export function RoundKicker({
  meta,
  withCategory = false,
}: {
  meta: RoundMeta;
  withCategory?: boolean;
}) {
  const category = categoryName(meta);
  const typeLine =
    meta.answerType === null ? null : answerWords(meta.answerType).line;
  const words: string[] = withCategory
    ? [category, typeLine].filter((part) => part !== null)
    : meta.difficulty === null
      ? []
      : [MYSTERY_COPY.difficulty[meta.difficulty]];
  return (
    <p
      data-kicker=""
      className={cx(
        // The clip keeps a wrapped part's dot out of sight (above).
        "flex flex-wrap items-center gap-x-[1.15em] overflow-hidden text-[0.8125rem] leading-[1.3] font-bold tracking-[0.01em]",
        TONE.ink3,
      )}
    >
      <span className="sr-only">
        {kickerText([roundLabel(meta), ...words])}
      </span>
      <span aria-hidden="true" className="min-w-0">
        {roundLabel(meta)}
      </span>
      {withCategory || meta.difficulty === null ? (
        words.map((word) => <Part key={word}>{word}</Part>)
      ) : (
        <Part>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={TONE.ink2}>
              <Pips difficulty={meta.difficulty} />
            </span>
            {MYSTERY_COPY.difficulty[meta.difficulty]}
          </span>
        </Part>
      )}
    </p>
  );
}
