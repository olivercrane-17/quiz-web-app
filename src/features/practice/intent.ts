/**
 * The next practice run's request (ARCHITECTURE §1.4 item 10, §6.2). It
 * travels in session storage as `qz:practice-intent`, never in a query
 * string, so every link stays path-only. Quick play and Play again write it
 * just before navigating to /practice/run, which reads it once and removes
 * it (./intent-read.ts), so a reload resumes the run instead of starting
 * another.
 *
 * This half has no runtime imports: the Quick play link on Today ships it
 * in Home's first load (a 1 kB island, §10.9 item 2).
 */
import type { CategoryId, DifficultyChoice } from "@/engine/types";

export const PRACTICE_INTENT_KEY = "qz:practice-intent";

export interface PracticeIntent {
  v: 1;
  /** quick: Today's Quick play; category: the /practice setup's Start. */
  mode: "quick" | "category";
  category: CategoryId | "mixed";
  difficulty: DifficultyChoice;
  /** "Play with repeats" after a short Hard filter ran out (PRD §3.3.1). */
  repeats?: boolean;
}

/** Quick play: Mixed category, Mixed difficulty, at once (PRD §3.3.1). */
export const QUICK_PLAY_INTENT: PracticeIntent = {
  v: 1,
  mode: "quick",
  category: "mixed",
  difficulty: "mixed",
};

/** Stores the request for /practice/run. Without session storage, the run starts as Quick play. */
export function writePracticeIntent(intent: PracticeIntent): void {
  try {
    sessionStorage.setItem(PRACTICE_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // Blocked storage: /practice/run then resumes or starts Quick play.
  }
}
