/**
 * Turning a finished run into what the results screen shows (DESIGN §12.11)
 * and what analytics records (PRD §7.2).
 */
import type { EventProps } from "@/analytics/dictionary";
import type { ItemId, PracticeItem } from "@/engine/types";

import type { PracticeHistoryEntry } from "./storage";

/** `run_complete.score_band` for practice: 0-3, 4-6, 7-8 or 9-10 (PRD §7.2). */
export function practiceScoreBand(
  score: number,
): EventProps<"run_complete">["score_band"] {
  if (score <= 3) return "0-3";
  if (score <= 6) return "4-6";
  if (score <= 8) return "7-8";
  return "9-10";
}

export interface ResultRow {
  /** 1-based, as "Question 4". */
  number: number;
  itemId: ItemId;
  correct: boolean;
  /** Null when the item is no longer in its pack (pulled since). */
  item: PracticeItem | null;
  /** The right option's text. */
  answer: string | null;
  /** The player's pick, when it was wrong. */
  chosen: string | null;
}

/** One row per question, in the order they were played. */
export function resultRows(
  entry: PracticeHistoryEntry,
  pool: readonly PracticeItem[],
): ResultRow[] {
  const byId = new Map(pool.map((item) => [item.id, item]));
  return entry.questions.map((question, index) => {
    const item = byId.get(question.itemId) ?? null;
    const answer = item?.options[item.correct] ?? null;
    const pick =
      item === null || question.chosen === null
        ? null
        : (item.options[question.chosen] ?? null);
    return {
      number: index + 1,
      itemId: question.itemId,
      correct: question.correct,
      item,
      answer,
      chosen: question.correct ? null : pick,
    };
  });
}
