"use client";

/**
 * Extension point (ARCHITECTURE §2.3): Today's restore notice, composed by
 * src/features/home/sections.tsx above Practice. It holds the restore-
 * success note after a sync code or a claim brought a profile back (DESIGN
 * §12.1): "Welcome back, Plucky Otter. Your 23-day streak is here." or
 * "You're all set. Your streak is safe in this browser." The backup
 * cookie's restore stays silent (AC-CKE-02), so it leaves no note.
 *
 * Today shows one notice at a time, first with content wins: the repair
 * card (the archive slot), then the streak notice, then this note. A notice
 * with nothing to say renders nothing, so its slot stays empty.
 *
 * Size: sections.tsx imports this file statically into Home's first load
 * (§10.9 item 2), so it only asks session storage whether a restore left a
 * note (`notice-flag.ts`), and loads the card with dynamic() when one did.
 */
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import { hasRestoreNotice } from "./notice-flag";

const RestoreNoticeCard = dynamic(() =>
  import("./home-notice-card").then((card) => card.RestoreNoticeCard),
);

/** Once a note was seen in this page load, the card stays to show it. */
let seen = false;

function noteWaiting(): boolean {
  if (!seen) seen = hasRestoreNotice();
  return seen;
}

const noSubscription = () => () => {};
const notOnTheServer = () => false;

export function RestoreNotice() {
  const waiting = useSyncExternalStore(
    noSubscription,
    noteWaiting,
    notOnTheServer,
  );
  return waiting ? <RestoreNoticeCard /> : null;
}
