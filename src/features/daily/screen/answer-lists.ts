/**
 * The guess list each Mystery gets (`RoundComponentProps.context.list`,
 * ARCHITECTURE §4.4.3), as a hook, so the round re-renders when its list
 * finishes loading: MYS-1's handles are immutable snapshots, and a list
 * that was still loading when the round mounted is replaced, not updated.
 *
 * The handle is MYS-1's `MysteryAnswerList` (`answerListFor(type)` behind
 * `useAnswerList`), so the guess field gets exact Enter, the announced
 * match totals and retry on top of the plain contract. `onAttempt` in
 * model/browser.ts warms the same store at the Daily's start with
 * `preloadAnswerLists`, in parallel with clue 1 (PRD §3.1.3).
 *
 * A list that fails to load reads `failed`, and the Mystery stays finishable
 * through Next clue and the four options on its last clue (PRD §4.1.3
 * item 8).
 */
import type { RoundMeta } from "@/engine/types";
import {
  useAnswerList,
  type MysteryAnswerList,
} from "@/features/rounds/client";

export function useRoundAnswerList(
  meta: RoundMeta | null,
): MysteryAnswerList | null {
  return useAnswerList(meta?.answerType ?? null);
}
