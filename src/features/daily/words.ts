/**
 * Words more than one Daily island renders: the answer-type phrases, the
 * difficulty bands and the countdown. They live apart from each island's
 * copy because a chunk takes a whole module (Turbopack doesn't drop the
 * exports a chunk leaves unused), so Today's card and the screens each
 * carry only their own strings.
 */
import type { AnswerType, DifficultyBand } from "@/engine/types";

/** "A film", "An element": the answer-type phrase chips and the answer-type line use. */
export const ANSWER_TYPE_WORDS: Readonly<Record<AnswerType, string>> = {
  country: "A country",
  city: "A city",
  person: "A person",
  film: "A film",
  tv_series: "A TV series",
  book: "A book",
  animal: "An animal",
  element: "An element",
  landmark: "A landmark",
  music_artist: "A music artist",
  dish: "A dish",
  sport: "A sport",
};

export const DIFFICULTY_WORDS: Readonly<Record<DifficultyBand, string>> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** Countdown words: "5h 12m", "12m", "under a minute". */
export function waitWords(ms: number): string {
  if (ms < 60_000) return "under a minute";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
