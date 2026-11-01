/**
 * The choice round's words (PRD §3.0.3, DESIGN §1.4, §6.10, §12.7): the
 * kicker, the verdict, the explanation sheet and the status announcement.
 * The round component is a client component, so these ship with it; they
 * are kept apart from the markup so the design team edits them here.
 */
import type { ChoiceFormat, DifficultyBand } from "@/engine/types";

const DIFFICULTY: Readonly<Record<DifficultyBand, string>> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** Filled pips by band (DESIGN §12.6): Easy ●○○, Medium ●●○, Hard ●●●. */
export const DIFFICULTY_PIPS: Readonly<Record<DifficultyBand, number>> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export const CHOICE_COPY = {
  /** "Question 4 of 10"; the difficulty word follows it. */
  kicker: (ordinal: number, ofType: number) =>
    `Question ${ordinal} of ${ofType}`,
  difficulty: DIFFICULTY,
  /** The verdict row of the explanation sheet. */
  right: "Right",
  wrong: "Not quite",
  /** The sheet's title: "It's Uranus.", and for true/false "It's true." */
  title: (answer: string, format: ChoiceFormat) =>
    format === "tf" ? `It's ${answer.toLowerCase()}.` : `It's ${answer}.`,
  /** The crowd line beside the verdict, once the numbers exist. */
  crowd: (percent: number) => `${percent}% got this one`,
  /** The polite status message at the reveal (PRD §3.0.3). */
  status: {
    correct: (answer: string) => `Correct. ${answer}.`,
    wrong: (chosen: string, answer: string) =>
      chosen === ""
        ? `Not quite. The answer is ${answer}.`
        : `Not quite. You chose ${chosen}. The answer is ${answer}.`,
  },
  learnMore: "Learn more",
  /** Contains the visible label (WCAG 2.5.3). */
  learnMoreLabel: (topic: string) =>
    `Learn more about ${topic} on Wikipedia (opens in a new tab)`,
  /** A sealed verdict that didn't come back and won't be retried. */
  error: "We couldn't check that answer. Try again.",
  /** Auto-advance's line on Continue, for screen readers. */
  autoAdvance: "Moving on by itself. Tap anywhere to stay.",
} as const;

/** The Wikipedia search the "Learn more" link opens (PRD §3.0.3). */
export function learnMoreUrl(topic: string): string {
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(topic)}`;
}
