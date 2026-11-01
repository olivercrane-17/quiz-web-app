/**
 * Extension point (ARCHITECTURE §2.3): "Challenge a friend", beside Share on
 * the stop screen (PRD §3.1.6 item 2, §3.6). Screens render
 * `<ChallengeButton attemptId={...} />`.
 *
 * A stub until CHL-1, which builds the first-time nickname step, creating
 * the challenge with a client key and sharing its link. It renders nothing
 * until then.
 */
import type { AttemptId } from "@/engine/types";

export interface ChallengeButtonProps {
  /** The finished attempt the challenge replays. */
  attemptId: AttemptId;
}

export function ChallengeButton(_props: ChallengeButtonProps) {
  return null;
}
