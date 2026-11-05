/**
 * Leading articles in suggestions (ARCHITECTURE §4.7, PRD §4.1.3).
 *
 * Keys drop a leading "the", "a" or "an" ("The Copper Owls" is stored as
 * "copper owls"), but `normalizeName` keeps a bare article with nothing
 * after it, so while a player is still typing one ("T", "Th", "The",
 * "The ") the query can't reach the names that start with it. The index
 * therefore keeps one more key for every display that starts with an
 * article, normalized the same way but with the article kept ("the copper
 * owls"), and matches the query normalized the same way against it.
 */
import { normalizeName } from "./normalize.ts";

/**
 * A leading "0 " shields the text: `normalizeName` only drops an article at
 * the very start, and none of its steps can join the shield to the text, so
 * the space between them survives every one.
 */
const SHIELD = "0 ";

/**
 * `normalizeName` with every step but its last, the leading-article drop:
 * "The Lantern Keeper (1987)" reads "the lantern keeper 1987". It runs
 * `normalizeName` itself, so the two can never drift apart.
 */
export function normalizeKeepingArticle(text: string): string {
  const shielded = normalizeName(SHIELD + text);
  return shielded.startsWith(SHIELD) ? shielded.slice(SHIELD.length) : "";
}

/** True when normalized text starts with an article followed by more words. */
export function startsWithArticle(normalized: string): boolean {
  return /^(?:the|an|a) \S/.test(normalized);
}
