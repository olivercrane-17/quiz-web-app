/**
 * Extension point (ARCHITECTURE §2.3): the actions on every reveal (PRD
 * §3.0.3, §3.13, §3.13.5): the heart toggle ("I liked this", named "I
 * liked this one") and "Report a problem", in the explanation sheet's row
 * of ghost actions. A round component renders, for example,
 * `<RevealActions itemRef={context.itemRef} mode="practice" round="choice" />`
 * (`analyticsMode()` in `@/features/analytics/track` maps a run mode).
 *
 * A stub until RPT-1, which builds the heart, the report sheet (with "My
 * guess should have counted" first on Mystery reveals, offering
 * `wrongGuesses`) and their outbox queueing. It renders nothing until then.
 */
import type { EventProps } from "@/analytics/dictionary";
import type { WrongGuess } from "@/engine/types";

export interface RevealActionsProps {
  /** HeartInput.itemRef: 'p.geo.0142', 'daily:42:2', 'room:<roomId>:7' or 'quiz:<code>:3'. */
  itemRef: string;
  /** For `question_heart` and `report_open`. */
  mode: EventProps<"question_heart">["mode"];
  /** Which reveal this is: picks the report reasons and `report_open.round_type`. */
  round: EventProps<"report_open">["round_type"];
  /** Mystery reveals: the wrong guesses offered under "My guess should have counted". */
  wrongGuesses?: readonly WrongGuess[];
}

export function RevealActions(_props: RevealActionsProps) {
  return null;
}
