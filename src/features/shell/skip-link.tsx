"use client";

/**
 * "Skip to content", first in every page and visible on focus (DESIGN
 * §6.13): an ink pill at the top left (`.kn-skip` in shell.css), parked
 * above the viewport until then. It moves focus to the page's `<main>`.
 *
 * Every shell frame renders `<main id="main">`, and Next keeps up to three
 * visited routes mounted but hidden, so after a navigation between route
 * groups the document can hold more than one. The link focuses the one that
 * is shown; the plain `#main` jump is the fallback before hydration.
 */
import { firstShown } from "@/ui/shown";

import { SHELL_CLIENT_COPY } from "./client-copy";
import { MAIN_ID } from "./landmarks";

export function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={(event) => {
        const main = firstShown<HTMLElement>(`main#${MAIN_ID}`);
        if (main === null) return;
        event.preventDefault();
        main.focus();
      }}
      className="kn-skip"
    >
      {SHELL_CLIENT_COPY.skipLink}
    </a>
  );
}
