"use client";

/**
 * "Skip to content", first in every page and visible on focus (DESIGN
 * §6.13). It moves focus to the page's `<main>`.
 *
 * Every shell frame renders `<main id="main">`, and Next keeps up to three
 * visited routes mounted but hidden, so after a navigation between route
 * groups the document can hold more than one. The link focuses the one that
 * is shown; the plain `#main` jump is the fallback before hydration.
 */
import { firstShown } from "@/ui/shown";

import { SHELL_COPY } from "./copy";
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
      className="sr-only rounded-xl bg-background px-4 py-3 font-bold text-foreground outline-offset-[3px] focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:outline-[3px] focus:outline-foreground"
    >
      {SHELL_COPY.skipLink}
    </a>
  );
}
