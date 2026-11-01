/**
 * The round's kicker and category chip (PRD §3.1.4, DESIGN §5 pips, §12.2):
 * "Mystery 2 of 3 · ●●○ Medium" above the clue screen, and "Mystery 2 of 3
 * · History · a person" above the reveal. Difficulty pips go from sparse
 * to dense and are always followed by the word, so they read without
 * colour; the pips themselves are decorative.
 */
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
  return (
    <p
      className={cx(
        "flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] leading-[1.3] font-bold tracking-[0.01em]",
        TONE.ink3,
      )}
    >
      <span>{roundLabel(meta)}</span>
      {withCategory ? (
        <>
          {category === null ? null : <span>· {category}</span>}
          {typeLine === null ? null : <span>· {typeLine}</span>}
        </>
      ) : meta.difficulty === null ? null : (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true">·</span>
          <span className={TONE.ink2}>
            <Pips difficulty={meta.difficulty} />
          </span>
          {MYSTERY_COPY.difficulty[meta.difficulty]}
        </span>
      )}
    </p>
  );
}
