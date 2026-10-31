/**
 * Name normalization for suggestions (ARCHITECTURE §4.7, step 1).
 *
 * The build stores each entity's normalized name, then its aliases, in
 * `keys` (§5.5), with this same function, so the device and the build
 * normalize identically. MYS-1 builds the rest of the suggestion engine
 * around it.
 */

/** Letters NFKD does not decompose, spelt the way English speakers type them. */
const SPECIAL_LETTERS: Readonly<Record<string, string>> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  þ: "th",
  ł: "l",
  ı: "i",
};

/**
 * NFKD, combining marks stripped, lower case, `&` read as "and",
 * apostrophes dropped inside words ("O'Brien" is "obrien"), every other run
 * of punctuation or symbols turned into one space, whitespace collapsed and
 * trimmed, and a leading "the ", "a " or "an " dropped.
 */
export function normalizeName(text: string): string {
  const folded = text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[ßæœøđðþłı]/gu, (letter) => SPECIAL_LETTERS[letter] ?? letter)
    .replace(/&/g, " and ")
    .replace(/['‘’ʼ`]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return folded.replace(/^(?:the|an|a) (?=\S)/, "");
}
