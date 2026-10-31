/**
 * Text helpers shared by the lint, dedupe and packets. Pure functions.
 *
 * `foldName` approximates the engine's `normalizeName` (ARCHITECTURE §4.7,
 * not built yet): case and diacritics folded, punctuation dropped. When the
 * engine module lands, C12 and C13 should switch to it so the lint and the
 * suggestion box agree exactly.
 */

/** Unicode code points, which is how the guide's character limits count. */
export function charCount(value: string): number {
  return Array.from(value).length;
}

/** Whitespace-separated tokens, numbers included (lint C02). */
export function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/u).length;
}

export function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "");
}

const SPECIAL_LETTERS: Record<string, string> = {
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
 * Lower case, no diacritics, apostrophes removed, every other non-letter
 * and non-digit turned into a space, spaces collapsed.
 */
export function foldName(value: string): string {
  return stripDiacritics(value.toLowerCase())
    .replace(/[ßæœøđðþłı]/gu, (ch) => SPECIAL_LETTERS[ch] ?? ch)
    .replace(/['’‘`]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The folded words of a text. */
export function foldedWords(value: string): string[] {
  const folded = foldName(value);
  return folded === "" ? [] : folded.split(" ");
}

/** A word token with its position in the original string. */
export interface WordSpan {
  word: string;
  start: number;
  end: number;
}

/**
 * Words as written (letters, digits and inner apostrophes or hyphens), with
 * offsets into the original text. Used by rules that must report where a
 * match is, or check its neighbours.
 */
export function wordSpans(value: string): WordSpan[] {
  const spans: WordSpan[] = [];
  const pattern = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
  for (const match of value.matchAll(pattern)) {
    spans.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return spans;
}

/** True when `phrase` (already folded) occurs in `folded` on word boundaries. */
export function containsPhrase(folded: string, phrase: string): boolean {
  if (phrase === "") return false;
  return ` ${folded} `.includes(` ${phrase} `);
}

/** Escapes a string for use inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ROT13 for ASCII letters; everything else unchanged. */
export function rot13(value: string): string {
  return value.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/** A short quoted excerpt for messages about plaintext content. */
export function excerpt(value: string, max = 60): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join("")}…`;
}
