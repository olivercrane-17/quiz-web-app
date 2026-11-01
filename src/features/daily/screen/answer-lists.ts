/**
 * The guess list each Mystery gets (`RoundComponentProps.context.list`,
 * ARCHITECTURE §4.4.3), as a hook, so the round re-renders when its list
 * finishes loading: MYS-1's handles are immutable snapshots, and a list
 * that was still loading when the round mounted is replaced, not updated.
 *
 * MYS-1 builds the handle store and its hook (`useAnswerList(type)` and
 * `preloadAnswerLists(types)` in src/features/rounds/answer-list.ts), but
 * neither is exported through `@/features/rounds/client` yet, and a feature
 * may import another feature only through its barrels (§2.2). The Wave 1
 * merge exports both from that barrel; this hook then becomes
 * `return useAnswerList(meta?.answerType ?? null);`, and `onAttempt` in
 * model/browser.ts calls `preloadAnswerLists`. Nothing else in the Daily
 * changes.
 *
 * Until then a Mystery gets no list, and stays finishable through Next clue
 * and the four options on its last clue (PRD §4.1.3 item 8).
 */
import type { RoundMeta } from "@/engine/types";
import type { AnswerListHandle } from "@/features/rounds";

export function useRoundAnswerList(
  _meta: RoundMeta | null,
): AnswerListHandle | null {
  return null;
}
