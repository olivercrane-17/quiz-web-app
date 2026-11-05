"use client";

/**
 * Your sync code, `/me/sync` (PRD §3.10.2, DESIGN §12.25): the code with
 * Copy code, I've saved it, the warning and Make a new code; it works
 * offline once the code is on the device. Inside an in-app browser the
 * claim link comes first, since one tap there moves the profile to the
 * system browser, with the code below it as the fallback (§9.5).
 * Below both, the way to restore a code from another device.
 *
 * Logs `sync_code_offer` (`manual`) once a code can be shown.
 */
import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { track } from "@/features/analytics/track";
import {
  detectBrowserContext,
  type DetectedContext,
} from "@/platform/browser-context";
import { buttonClasses } from "@/ui/button-classes";
import { Skeleton } from "@/ui/skeleton";

import { bootClient, onIdentityChange } from "../boot";
import { ClaimPanel } from "../claim/claim-panel";
import { IDENTITY_CLIENT_COPY } from "../client-copy";
import { readDeviceIdentity } from "../device";
import { RESTORE_HREF } from "../links";
import { SyncCodePanel } from "./sync-code-panel";

const COPY = IDENTITY_CLIENT_COPY;

type Place =
  | { phase: "loading" }
  | { phase: "ready"; registered: boolean; browser: DetectedContext };

export function SyncScreen() {
  const [place, setPlace] = useState<Place>({ phase: "loading" });
  const fallbackId = useId();

  useEffect(() => {
    let live = true;
    const settle = () => {
      void Promise.all([bootClient(), detectBrowserContext()]).then(
        ([, browser]) => {
          if (!live) return;
          setPlace({
            phase: "ready",
            registered: readDeviceIdentity()?.registered === true,
            browser,
          });
        },
      );
    };
    settle();
    const stop = onIdentityChange(settle);
    return () => {
      live = false;
      stop();
    };
  }, []);

  const registered = place.phase === "ready" && place.registered;
  useEffect(() => {
    if (registered) track("sync_code_offer", { trigger: "manual" });
  }, [registered]);

  const restore = (
    <p className="flex flex-wrap items-center gap-x-2 text-body-sm">
      <span className="text-ink-2">{COPY.sync.restoreLead}</span>
      <Link href={RESTORE_HREF} className={buttonClasses({ variant: "text" })}>
        {COPY.sync.restoreLink}
      </Link>
    </p>
  );

  if (place.phase === "loading") {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">{COPY.sync.loading}</span>
        <Skeleton shape="block" height="5.5rem" />
      </div>
    );
  }

  if (place.registered && place.browser.context === "in_app") {
    return (
      <div className="flex flex-col gap-8" data-sync-screen="in-app">
        <ClaimPanel browser={place.browser} />
        <section
          aria-labelledby={fallbackId}
          className="flex flex-col gap-3 border-t border-rule pt-6"
        >
          <h2 id={fallbackId} className="font-display text-display-6">
            {COPY.sync.fallback.title}
          </h2>
          <p className="text-body-sm text-ink-2">{COPY.sync.fallback.body}</p>
          <SyncCodePanel trigger="manual" allowNew />
        </section>
        {restore}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-sync-screen="browser">
      <SyncCodePanel trigger="manual" allowNew />
      {restore}
    </div>
  );
}
