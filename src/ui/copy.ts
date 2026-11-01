/**
 * The default words the primitives show (DESIGN §1.4, §6.1, §6.2). Features
 * that need different wording pass their own through the components' label
 * props, so their copy stays in `src/features/<area>/copy.ts`.
 */
export const UI_COPY = {
  /** A server verdict that takes longer than 1.5 s (PRD §3.0.2). One ellipsis character. */
  checking: "Checking…",
  loading: "Loading…",
  close: "Close",
  answer: {
    correct: "Correct answer",
    yourAnswer: "Your answer",
    alreadyGuessed: "Already guessed",
    /** Screen readers only: the pick waiting for its verdict. */
    lockedIn: "Locked in",
  },
} as const;

export interface AnswerButtonLabels {
  correct: string;
  yourAnswer: string;
  alreadyGuessed: string;
  lockedIn: string;
}
