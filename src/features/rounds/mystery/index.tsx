/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): the Mystery round (PRD
 * §3.1.4, DESIGN §6.3, §6.4): the answer-type line, the stake indicator, the
 * clue ladder, the ARIA 1.2 guess combobox over context.list, Next clue,
 * wrong-guess stamps, the clue-4 options, and the reveal and withdrawn
 * cards.
 *
 * A stub until MYS-1, which replaces this file's body and keeps its export:
 * a component taking RoundComponentProps, registered in ../registry.tsx.
 */
import type { RoundComponentProps } from "../contracts";
import { RoundPlaceholder } from "../placeholder";

export function MysteryRound(_props: RoundComponentProps) {
  return <RoundPlaceholder family="mystery" />;
}
