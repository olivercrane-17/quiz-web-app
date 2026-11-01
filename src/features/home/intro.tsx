"use client";

/**
 * Today's dateline and greeting, the page's one `h1` (DESIGN §12.1).
 *
 * - On a full load, the prerendered placeholder is replaced before first
 *   paint by the inline script; `suppressHydrationWarning` keeps what it
 *   wrote, and the store then renders the same text.
 * - On a client navigation the script doesn't run, and the client snapshot
 *   renders the right text on the first render.
 *
 * The device clock is read in the store's snapshot, never during the
 * server render (ARCHITECTURE §10.2 rule 4).
 */
import { useSyncExternalStore } from "react";

import { InlineScript } from "@/ui/inline-script";

import { HOME_COPY } from "./copy";
import { INTRO_IDS, INTRO_WORDS, introScript, introTextAt } from "./intro-text";

const SCRIPT = introScript();
const SEPARATOR = "\n";
const PLACEHOLDER = `${HOME_COPY.greetingFallback}${SEPARATOR} `;

function subscribe(): () => void {
  // The lines change at most hourly; a visit reads them once.
  return () => {};
}

/** A string, so consecutive snapshots compare equal. */
function clientSnapshot(): string {
  const text = introTextAt(new Date(), INTRO_WORDS);
  return `${text.greeting}${SEPARATOR}${text.date}`;
}

function serverSnapshot(): string {
  return PLACEHOLDER;
}

export function HomeIntro() {
  const [greeting, date] = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  ).split(SEPARATOR);
  return (
    <div className="flex flex-col gap-1 pt-2 pb-5">
      <p className="text-sm font-semibold text-muted-foreground">
        <span id={INTRO_IDS.date} suppressHydrationWarning>
          {date}
        </span>
      </p>
      <h1 className="text-[clamp(28px,8.5vw,33px)] leading-tight font-semibold">
        <span id={INTRO_IDS.greeting} suppressHydrationWarning>
          {greeting}
        </span>
      </h1>
      <InlineScript html={SCRIPT} />
    </div>
  );
}
