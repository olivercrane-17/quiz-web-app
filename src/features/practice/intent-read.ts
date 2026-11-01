/**
 * Reading `qz:practice-intent` (./intent.ts) on /practice/run: once, and
 * then it is gone, so a reload of the run resumes it. A value that isn't a
 * request is dropped.
 */
import { CATEGORY_IDS, type CategoryId } from "@/engine/types";

import { PRACTICE_INTENT_KEY, type PracticeIntent } from "./intent";

const DIFFICULTIES = ["easy", "medium", "hard", "mixed"] as const;

export function decodePracticeIntent(raw: unknown): PracticeIntent | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const { v, mode, category, difficulty, repeats } = raw as Record<
    string,
    unknown
  >;
  if (v !== 1 || (mode !== "quick" && mode !== "category")) return null;
  if (
    category !== "mixed" &&
    !(CATEGORY_IDS as readonly unknown[]).includes(category)
  ) {
    return null;
  }
  if (!(DIFFICULTIES as readonly unknown[]).includes(difficulty)) return null;
  if (repeats !== undefined && typeof repeats !== "boolean") return null;
  const intent: PracticeIntent = {
    v: 1,
    mode,
    category: category as CategoryId | "mixed",
    difficulty: difficulty as PracticeIntent["difficulty"],
  };
  if (repeats === true) intent.repeats = true;
  return intent;
}

/** The request waiting for /practice/run, removed as it is read. */
export function takePracticeIntent(): PracticeIntent | null {
  try {
    const text = sessionStorage.getItem(PRACTICE_INTENT_KEY);
    if (text === null) return null;
    sessionStorage.removeItem(PRACTICE_INTENT_KEY);
    return decodePracticeIntent(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}
