/**
 * The choice round's words (PRD §3.0.3, DESIGN §1.4, §6.10, §12.7): the
 * kicker, the verdict, the explanation sheet and the status announcement.
 * The round component is a client component, so these ship with it; they
 * are kept apart from the markup so the design team edits them here.
 */
import { midSentence } from "@/engine/rounds/choice/labels";
import type { CategoryId, ChoiceFormat, DifficultyBand } from "@/engine/types";

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
  /** The verdict row of the explanation sheet, the first words of its heading. */
  right: "Right",
  wrong: "Not quite",
  /**
   * The sheet's title, with the answer as it reads mid-sentence (R1-25):
   * "It's Uranus.", "It's the bell comb.", "It's the Glaziers' Guild.",
   * "It's The Great Gatsby." (a title keeps its article), and for
   * true/false "It's true."
   */
  title: (
    answer: string,
    format: ChoiceFormat,
    category: CategoryId | null = null,
  ) =>
    format === "tf"
      ? `It's ${answer.toLowerCase()}.`
      : `It's ${midSentence(answer, category)}.`,
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
  /**
   * The line under the options once a keyboard is in use (D20, R2-02): the
   * badges' letters answer, one key per answer, while focus is on an
   * option. The digits still follow D6 and go unsaid. It names only the
   * letters on screen, so true/false and comparisons read "Keys A and B
   * answer." and a three-option question "Keys A to C answer."
   */
  keysLegend: (options: number) =>
    options <= 2
      ? "Keys A and B answer."
      : `Keys A to ${options === 3 ? "C" : "D"} answer.`,
} as const;

/** The Wikipedia search the "Learn more" link opens (PRD §3.0.3). */
export function learnMoreUrl(topic: string): string {
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(topic)}`;
}
