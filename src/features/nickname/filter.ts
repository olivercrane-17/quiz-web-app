/**
 * The client half of the slur filter (PRD §3.9.4, ARCHITECTURE §8.13):
 * instant feedback while a player types text that others will see. The
 * nickname field uses it, and so can every other such field (Group names,
 * room names, quiz fields) through this feature's index.ts. SQL stays the
 * authority: `set_nickname` and every other text RPC run
 * `private.text_is_blocked` with the same list and the same folding
 * (AC-LNT-03), so a text this passes can still come back `blocked_text`,
 * as when the list has changed since the page loaded.
 *
 * The term list never rides in a first load. The engine can't import
 * content modules (ARCHITECTURE §2.2), so the list loads here: the first
 * call imports ./filter-list, which decodes it and compiles it once, and
 * every later call shares that import. A failed import (offline) is
 * forgotten, so the next call tries again.
 *
 * Nothing here keeps, logs or reports the text it checks, and the verdict
 * is all a caller gets back.
 */

export interface TextFilter {
  /** True when the text holds a listed term under any normalization. */
  isBlocked(text: string): boolean;
}

let loading: Promise<TextFilter> | null = null;

/** The filter, compiled from the term list on first use. */
export function loadTextFilter(): Promise<TextFilter> {
  if (loading === null) {
    const attempt = import("./filter-list").then((chunk) => chunk.textFilter);
    loading = attempt;
    attempt.catch(() => {
      if (loading === attempt) loading = null;
    });
  }
  return loading;
}
