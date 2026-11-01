/**
 * `normalizeName` with a map back to the source text, so a suggestion row
 * can bold exactly the letters the player typed ("**Côte d**'Ivoire" for
 * "cote d"), whatever accents, apostrophes and punctuation the display form
 * holds (ARCHITECTURE §4.4.3, `Suggestion.match`; DESIGN §6.4).
 *
 * It applies the same steps as `normalizeName`, one code point at a time,
 * and keeps the source range (UTF-16 offsets, end exclusive) each output
 * character came from. Whole-string lower-casing can differ from per-letter
 * lower-casing in rare contexts (a final Greek sigma), so callers compare
 * `text` with `normalizeName(source)` and skip the highlight when they
 * differ.
 */
import { normalizeName } from "./normalize.ts";

/** Letters NFKD does not decompose; the same table as `normalizeName`. */
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

export interface MappedText {
  text: string;
  /** Source offset where output character i starts. */
  start: number[];
  /** Source offset where output character i ends (exclusive). */
  end: number[];
}

function fold(char: string): string {
  return char
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[ßæœøđðþłı]/gu, (letter) => SPECIAL_LETTERS[letter] ?? letter)
    .replace(/&/g, " and ")
    .replace(/['‘’ʼ`.]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}

export function normalizeWithOffsets(source: string): MappedText {
  const chars: string[] = [];
  const start: number[] = [];
  const end: number[] = [];
  let offset = 0;
  for (const codePoint of source) {
    const from = offset;
    offset += codePoint.length;
    for (const out of fold(codePoint)) {
      // Collapse runs of spaces, and drop leading ones.
      if (out === " " && (chars.length === 0 || chars.at(-1) === " ")) {
        continue;
      }
      chars.push(out);
      start.push(from);
      end.push(offset);
    }
  }
  while (chars.at(-1) === " ") {
    chars.pop();
    start.pop();
    end.pop();
  }
  const text = chars.join("");
  const article = /^(?:the|an|a) (?=\S)/.exec(text);
  const drop = article === null ? 0 : article[0].length;
  return {
    text: text.slice(drop),
    start: start.slice(drop),
    end: end.slice(drop),
  };
}

/** True where a word starts: the beginning, or just after a space. */
function isWordStart(text: string, at: number): boolean {
  return at === 0 || text.charAt(at - 1) === " ";
}

/**
 * Where `query` (already normalized) first matches `source` at a word
 * start, as a source range for `<mark>`; null when it doesn't, or when the
 * mapping can't be trusted. The range is widened over combining marks that
 * follow it, so a decomposed accent stays with its letter.
 */
export function highlightRange(
  source: string,
  query: string,
): { start: number; end: number } | null {
  if (query === "") return null;
  const mapped = normalizeWithOffsets(source);
  if (mapped.text !== normalizeName(source)) return null;
  let at = mapped.text.indexOf(query);
  while (at !== -1 && !isWordStart(mapped.text, at)) {
    at = mapped.text.indexOf(query, at + 1);
  }
  if (at === -1) return null;
  const from = mapped.start[at];
  let to = mapped.end[at + query.length - 1];
  if (from === undefined || to === undefined) return null;
  while (to < source.length && /\p{M}/u.test(source.charAt(to))) to += 1;
  return { start: from, end: to };
}
