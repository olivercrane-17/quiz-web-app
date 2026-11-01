/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): multiple choice, true/false
 * and comparison rounds (PRD §3.0.3, §3.3.2): the stem, the options as
 * AnswerButtons with commit on release, the reveal at 400 ms, the
 * explanation sheet with Continue where the answers were, keys 1 to 4 scoped
 * to the question, and status announcements.
 *
 * A stub until PRA-1, which replaces this file's body and keeps its export:
 * a component taking RoundComponentProps, registered in ../registry.tsx.
 */
import type { RoundComponentProps } from "../contracts";
import { RoundPlaceholder } from "../placeholder";

export function ChoiceRound(_props: RoundComponentProps) {
  return <RoundPlaceholder family="choice" />;
}
