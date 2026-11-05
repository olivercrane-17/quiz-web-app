/**
 * Typo tolerance (ARCHITECTURE §4.7 step 2, PRD §4.1.3 step 3): a key, or
 * a word in it, matches a query of 5 or more characters when it starts with
 * a string within one edit of the query: one insertion, deletion,
 * substitution or adjacent swap (the optimal string alignment distance).
 *
 * The check is linear and allocation-free: walk to the first mismatch,
 * then try each of the four repairs on the rest.
 */

/** The typo pass runs only for queries at least this long. */
export const TYPO_MIN_LENGTH = 5;

/** True when `text` from `at` continues with `query` from `from`. */
function continuesWith(
  text: string,
  at: number,
  query: string,
  from: number,
): boolean {
  const length = query.length - from;
  if (at + length > text.length) return false;
  for (let i = 0; i < length; i += 1) {
    if (text.charCodeAt(at + i) !== query.charCodeAt(from + i)) return false;
  }
  return true;
}

/**
 * True when some prefix of `text.slice(at)` is within one edit of `query`
 * (an exact prefix counts too: zero edits).
 */
export function prefixWithinOneEdit(
  text: string,
  at: number,
  query: string,
): boolean {
  const n = query.length;
  const available = text.length - at;
  let i = 0;
  while (
    i < n &&
    i < available &&
    text.charCodeAt(at + i) === query.charCodeAt(i)
  ) {
    i += 1;
  }
  if (i === n) return true;
  // The text ran out first: it matches with the query's last letter deleted.
  if (i === available) return n - i === 1;
  return (
    // substitution
    continuesWith(text, at + i + 1, query, i + 1) ||
    // the query has an extra letter
    continuesWith(text, at + i, query, i + 1) ||
    // the text has an extra letter
    continuesWith(text, at + i + 1, query, i) ||
    // adjacent swap
    (i + 1 < n &&
      text.charCodeAt(at + i) === query.charCodeAt(i + 1) &&
      text.charCodeAt(at + i + 1) === query.charCodeAt(i) &&
      continuesWith(text, at + i + 2, query, i + 2))
  );
}
