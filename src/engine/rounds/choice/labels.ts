/**
 * How a choice round's options read on screen and inside sentences (PRD
 * §3.0.3, §3.3.2; RITE round 1 findings R1-13 and R1-25; decision D6).
 * Pure text, shared by the round component and the practice results, so a
 * label reads the same on the option, in the reveal's title, in the status
 * message and on the results row. The judge never sees these: it works on
 * display positions, and the stored run keeps the labels as written.
 *
 * - `displayLabels`: once one option is a year BC, every bare year in the
 *   set carries its era too, so "300 BC" never sits beside a "45" that reads
 *   like a count. The era follows the set's own style: "AD 45" beside "BC"
 *   (CONTENT_GUIDE §3.3: "around 2560 BC", "AD 79"), "45 CE" beside "BCE".
 * - `hasNumberOption`: D6, digits pick an option only when no option holds
 *   a number. "4" for "four bridges" must never lock in option D.
 * - `midSentence`: a label as it reads inside a sentence ("It's the bell
 *   comb.", "You chose the Masons' Guild").
 */
import { sortKey } from "../../text/metrics.ts";
import type { CategoryId } from "../../types/content.ts";

/** A year's era written after it: "300 BC", "300 BCE". */
const BC_AFTER = / ?BC(E)?$/i;
const DIGIT = /\p{Nd}/u;

/**
 * The labels of one question's options, in the order given, as they show:
 * when at least one is a year BC and every other one is a year (with or
 * without its era), the bare years gain theirs. Any other set comes back as
 * it is.
 */
export function displayLabels(labels: readonly string[]): string[] {
  const keys = labels.map((label) => sortKey(label));
  let style: "AD" | "CE" | null = null;
  for (const [index, key] of keys.entries()) {
    // Counts, quantities and words: nothing here is a year.
    if (key === null || key.form === "quantity") return [...labels];
    if (key.form === "era" && style === null) {
      const bc = BC_AFTER.exec((labels[index] ?? "").trim());
      if (bc !== null) style = bc[1] === undefined ? "AD" : "CE";
    }
  }
  if (style === null) return [...labels];
  const era = style;
  return labels.map((label, index) => {
    if (keys[index]?.form !== "plain") return label;
    const year = label.trim();
    return era === "AD" ? `AD ${year}` : `${year} CE`;
  });
}

/** D6: true when any option holds a digit, so digit keys could be read as the answer itself. */
export function hasNumberOption(labels: readonly string[]): boolean {
  return labels.some((label) => DIGIT.test(label));
}

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
 * The categories whose options are often titles of works (Film & TV, Music,
 * Art & Design, Books & Literature). A title keeps its article: "It's The
 * Great Gatsby."
 */
const WORK_CATEGORIES: ReadonlySet<CategoryId> = new Set([
  "film",
  "music",
  "art",
  "book",
]);

/** Place names whose article is part of the official name. */
const OFFICIAL_THE: ReadonlySet<string> = new Set(["The Hague", "The Gambia"]);

/** Every word starts upper case, apart from minor words: "Glaziers' Guild", "Lord of the Rings". */
function isTitleCase(words: readonly string[]): boolean {
  return (
    words.some((word) => /^\p{Lu}/u.test(word)) &&
    words.every(
      (word) => MINOR_WORDS.has(word.toLowerCase()) || !/^\p{Ll}/u.test(word),
    )
  );
}

/**
 * An option label as it reads inside a sentence. Labels are sentence case,
 * so a leading article is capitalized only because it comes first: "The
 * bell comb" reads "the bell comb" and "A tide staff" "a tide staff".
 *
 * A name in title case keeps "A" or "An" ("A Coruña", "A Tale of Two
 * Cities") but lowers a leading "The", as running text does: "the Glaziers'
 * Guild", "the Ashen Hills", "the Netherlands". Two kinds keep it: titles
 * of works, in the categories that hold them ("The Great Gatsby", "The
 * Persistence of Memory"), and the few places whose article is official
 * ("The Hague").
 */
export function midSentence(
  label: string,
  category: CategoryId | null = null,
): string {
  const match = /^(The|A|An) (.+)$/.exec(label);
  if (match === null) return label;
  const [, article = "", rest = ""] = match;
  if (!isTitleCase(rest.split(/\s+/)))
    return `${article.toLowerCase()} ${rest}`;
  if (article !== "The" || OFFICIAL_THE.has(label)) return label;
  if (category !== null && WORK_CATEGORIES.has(category)) return label;
  return `the ${rest}`;
}
