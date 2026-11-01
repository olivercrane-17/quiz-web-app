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

/** Short words that stay lower case inside a title ("A Tale of Two Cities"). */
const MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/**
 * An option label as it reads mid-sentence. Labels are sentence case, so a
 * leading article is capitalized only because it comes first: "The bell
 * comb" reads "the bell comb" and "A tide staff" "a tide staff". A label in
 * title case is a name or a title and keeps its article as it is: "The
 * Great Gatsby", "The Hague", "A Tale of Two Cities".
 */
export function midSentence(label: string): string {
  const match = /^(The|A|An) (.+)$/.exec(label);
  if (match === null) return label;
  const [, article = "", rest = ""] = match;
  const words = rest.split(/\s+/);
  const titled =
    words.some((word) => /^\p{Lu}/u.test(word)) &&
    words.every(
      (word) => MINOR_WORDS.has(word.toLowerCase()) || !/^\p{Ll}/u.test(word),
    );
  return titled ? label : `${article.toLowerCase()} ${rest}`;
}

export const CHOICE_COPY = {
  /** "Question 4 of 10"; the difficulty word follows it. */
  kicker: (ordinal: number, ofType: number) =>
    `Question ${ordinal} of ${ofType}`,
  difficulty: DIFFICULTY,
  /** The verdict row of the explanation sheet, the first words of its heading. */
  right: "Right",
  wrong: "Not quite",
  /**
   * The sheet's title: "It's Uranus.", "It's the bell comb." (a leading
   * article in lower case, see `midSentence`), and for true/false "It's
   * true."
   */
  title: (answer: string, format: ChoiceFormat) =>
    format === "tf"
      ? `It's ${answer.toLowerCase()}.`
      : `It's ${midSentence(answer)}.`,
  /** The compact sheet's way to the rest of the explanation (DESIGN §6.10). */
  readMore: "Read more",
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
