/**
 * The not-found page's metadata (DESIGN §11 "unique page titles", §12.42;
 * RITE round 1, R1-02): "Page not found · Knewt", so a dead link never
 * shares Today's title (WCAG 2.4.2).
 *
 * The root not-found page uses it. A route module that calls `notFound()`
 * uses it too, as its metadata for that case: Next titles the page from
 * the module that threw, so a group's not-found file can't. The Beta
 * route modules (the editor, rooms and shared quizzes) export it while
 * their flag is off; "Page not found" names no Beta feature (AC-ROM-13).
 *
 * No robots field: Next adds `noindex` to every not-found response by
 * itself, and a second one would print the tag twice.
 */
import type { Metadata } from "next";

import { SHELL_COPY } from "./copy";

export const NOT_FOUND_METADATA: Metadata = {
  title: SHELL_COPY.notFound.title,
};
