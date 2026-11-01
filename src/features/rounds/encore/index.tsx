/**
 * Extension point (ARCHITECTURE §2.3, §4.4.3): the Encore round (PRD §3.1.5,
 * DESIGN §6.5): the unit beside the field, the preview ("You're answering
 * 1,250 km"), inline errors, Lock in, and the result line with its band and
 * number line.
 *
 * A stub until MYS-1, which replaces this file's body and keeps its export:
 * a component taking RoundComponentProps, registered in ../registry.tsx.
 */
import type { RoundComponentProps } from "../contracts";
import { RoundPlaceholder } from "../placeholder";

export function EncoreRound(_props: RoundComponentProps) {
  return <RoundPlaceholder family="encore" />;
}
