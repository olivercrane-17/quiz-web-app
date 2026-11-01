/**
 * The guess list each Mystery gets (`RoundComponentProps.context.list`,
 * ARCHITECTURE §4.4.3). MYS-1 builds the AnswerListHandle over the closed
 * answer lists (`src/features/rounds/answer-list.ts`, on its own branch in
 * Wave 1); the Wave 1 merge plugs it in here, one handle per answer type,
 * and nothing else in the Daily changes. The lists themselves already
 * preload when the attempt starts (`onAttempt` in model/browser.ts).
 *
 * Until then a Mystery gets no list, and stays finishable through Next clue
 * and the four options on its last clue (PRD §4.1.3 item 8).
 */
import type { RoundMeta } from "@/engine/types";
import type { AnswerListHandle } from "@/features/rounds";

export function answerListFor(_meta: RoundMeta): AnswerListHandle | null {
  return null;
}
