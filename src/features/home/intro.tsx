"use client";

/**
 * Today's dateline and greeting, the page's one `h1` (DESIGN §12.1), and
 * on a first visit the line under it (D18).
 *
 * - On a full load, the prerendered placeholders are replaced before first
 *   paint by the inline script; `suppressHydrationWarning` keeps what it
 *   wrote, and the stores then render the same text.
 * - On a client navigation the script doesn't run, and the client
 *   snapshots render the right text on the first render.
 *
 * The device clock and storage are read in the stores' snapshots, never
 * during the server render (ARCHITECTURE §10.2 rule 4). Whether this is a
 * first visit is read once per page load, so the line never comes or goes
 * while Today is on screen (the identity is minted moments after the first
 * load, `./intro-text.ts`).
 *
 * Sizes are the rem tokens (`display-2` for the greeting, `meta` for the
 * dateline), so at 200% text the `h1` stays the largest heading on the
 * page (RITE round 1, R1-34); on short phones the greeting steps down to
 * 26 to 30 px, as DESIGN §10.2 asks, to keep Play above the fold.
 */
import { useSyncExternalStore } from "react";

import { InlineScript } from "@/ui/inline-script";

import { HOME_COPY } from "./copy";
import {
  INTRO_IDS,
  INTRO_WORDS,
  identityStorageKey,
  introScript,
  introTextAt,
  isFirstVisit,
} from "./intro-text";

const SCRIPTS = {
  devices: introScript({ devices: true }),
  plain: introScript({ devices: false }),
} as const;
const SEPARATOR = "\n";
const PLACEHOLDER = `${HOME_COPY.greetingFallback}${SEPARATOR} `;

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

/** Whether this page load began on a device with no identity; read once. */
let firstVisitThisLoad: boolean | undefined;

function readFirstVisit(devices: boolean): boolean {
  if (firstVisitThisLoad === undefined) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      // Some private windows throw on access: no identity can persist.
    }
    const device = devices
      ? (window as { __QZ_DEVICE__?: unknown }).__QZ_DEVICE__
      : null;
    firstVisitThisLoad = isFirstVisit(storage, identityStorageKey(device));
  }
  return firstVisitThisLoad;
}

const firstVisitSnapshots = {
  devices: () => readFirstVisit(true),
  plain: () => readFirstVisit(false),
} as const;

/** Tests only: the next render reads storage again, as a new page load would. */
export function resetIntroForTests(): void {
  firstVisitThisLoad = undefined;
}

/** The prerendered HTML shows the line; the inline script hides it for a returning player. */
function firstVisitOnTheServer(): boolean {
  return true;
}

export function HomeIntro({
  devices,
}: {
  /** Mock builds: honour a test's device namespace, as the boot script does. */
  devices: boolean;
}) {
  const variant = devices ? "devices" : "plain";
  const [greeting, date] = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  ).split(SEPARATOR);
  const firstVisit = useSyncExternalStore(
    subscribe,
    firstVisitSnapshots[variant],
    firstVisitOnTheServer,
  );
  return (
    <div data-home-intro="" className="flex flex-col gap-1 pt-2 pb-5">
      <p className="text-meta text-ink-3">
        <span id={INTRO_IDS.date} suppressHydrationWarning>
          {date}
        </span>
      </p>
      <h1 className="font-display text-display-2 [@media(max-height:700px)]:text-display-3">
        <span id={INTRO_IDS.greeting} suppressHydrationWarning>
          {greeting}
        </span>
      </h1>
      <p
        id={INTRO_IDS.firstVisit}
        hidden={!firstVisit}
        suppressHydrationWarning
        className="mt-1 text-body-sm text-ink-2"
      >
        {HOME_COPY.firstVisit}
      </p>
      <InlineScript html={SCRIPTS[variant]} />
    </div>
  );
}
