/**
 * Route module (ARCHITECTURE §10.1): Your sync code, `/me/sync` (PRD
 * §3.10.2, DESIGN §12.25), in the (tabs) group under Me. A static shell
 * whose island reads the device after first paint, so it works offline
 * once the code is on the device. `src/app/(tabs)/me/sync/page.tsx`
 * re-exports it.
 *
 * Linked from Me (STA-1) and Settings' Your profile rows (SET-1), with
 * `SYNC_HREF` and `IDENTITY_COPY.links.sync`.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { TopBarTitle } from "@/features/shell/client";
import { buttonClasses } from "@/ui/button-classes";

import { IDENTITY_COPY } from "../copy";
import { ArrowLeftIcon } from "../icons";
import { SyncScreen } from "../sync/sync-screen";

export const metadata: Metadata = {
  title: IDENTITY_COPY.metadata.sync,
  robots: { index: false },
};

export default function SyncRoute() {
  return (
    <div
      data-sync-page=""
      className="mx-auto flex w-full max-w-play flex-col gap-6 py-2"
    >
      <TopBarTitle
        title={IDENTITY_COPY.sync.title}
        start={
          <Link
            href="/me"
            aria-label={IDENTITY_COPY.backToMe}
            className={buttonClasses({ variant: "icon" })}
          >
            <ArrowLeftIcon size={24} />
          </Link>
        }
      />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-display-2 max-md:sr-only">
          {IDENTITY_COPY.sync.title}
        </h1>
        <p className="text-body">{IDENTITY_COPY.sync.intro}</p>
        <p className="text-body-sm text-ink-2">{IDENTITY_COPY.whatMoves}</p>
      </header>
      <SyncScreen />
    </div>
  );
}
