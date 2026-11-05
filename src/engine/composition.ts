/**
 * The composition id of a Daily (ARCHITECTURE §4.9): each run of identical
 * consecutive round types becomes a letter and a count. Mystery m, encore e,
 * mc c, tf t, comparison p, ordering o. So [mystery, mystery, mystery,
 * encore] is m3e1, [mc ×9, encore] is c9e1 and [mc ×5, mystery, encore] is
 * c5m1e1. Analytics' run_complete.composition carries it, and share layouts
 * are keyed by it (content/compositions.json).
 */
import type { CompositionId } from "./types/daily.ts";
import type { RoundType } from "./types/rounds.ts";

export const COMPOSITION_LETTERS: Readonly<Record<RoundType, string>> = {
  mystery: "m",
  encore: "e",
  mc: "c",
  tf: "t",
  comparison: "p",
  ordering: "o",
};

export function compositionIdOf(types: readonly RoundType[]): CompositionId {
  let out = "";
  let run: RoundType | null = null;
  let count = 0;
  for (const type of types) {
    if (type === run) {
      count += 1;
      continue;
    }
    if (run !== null) out += `${COMPOSITION_LETTERS[run]}${count}`;
    run = type;
    count = 1;
  }
  if (run !== null) out += `${COMPOSITION_LETTERS[run]}${count}`;
  return out;
}
