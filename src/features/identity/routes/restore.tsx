/**
 * Route module (ARCHITECTURE §10.1): Restore from a code, `/restore` (PRD
 * §3.10.2, §5.13; DESIGN §12.26), in the (landing) group, since it opens
 * from Settings, from the installed app's first screen and from an expired
 * claim link alike. A static shell with the form as its island.
 * `src/app/(landing)/restore/page.tsx` re-exports it.
 *
 * Linked from Settings' Your profile rows (SET-1), the installed first run
 * (CAL-1), `/me/sync` and the claim page, with `RESTORE_HREF`.
 */
import type { Metadata } from "next";

import { IDENTITY_COPY } from "../copy";
import { RestoreScreen } from "../restore/restore-screen";

export const metadata: Metadata = {
  title: IDENTITY_COPY.metadata.restore,
  robots: { index: false },
};

export default function RestoreRoute() {
  return (
    <div data-restore-page="" className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-display-2">
          {IDENTITY_COPY.restore.title}
        </h1>
        <p className="text-body">{IDENTITY_COPY.restore.intro}</p>
        <p className="text-body-sm text-ink-2">{IDENTITY_COPY.whatMoves}</p>
      </header>
      <RestoreScreen />
    </div>
  );
}
