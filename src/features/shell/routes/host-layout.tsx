/**
 * The `(host)` layout (ARCHITECTURE §2.1, DESIGN §10.4): the big screen.
 * Designed at 1280 by 720 and scaled by one unit, `--u: min(1vw,
 * 1.7778vh)`, so every size keeps its proportion from a laptop to a 4K TV,
 * with everything 5% inside the edges for TVs that overscan. Under 1024 by
 * 576 it shows a note instead of the host screen.
 * `src/app/(host)/layout.tsx` re-exports it.
 *
 * The not-found page (`data-not-found`, a `notFound()` in this group such
 * as a room with the rooms flag off) is no host screen, so it shows at
 * every size and the note stays away: a phone that follows a dead room
 * link gets the heading and its way back to Today, never only "open Knewt
 * on your phone" (RITE round 1, R1-02). The overrides are utilities, so
 * they outrank `max-lg:hidden` and `max-lg:block`.
 */
import type { CSSProperties, ReactNode } from "react";

import { IncidentBanner } from "@/features/incidents/banner";
import { LiveRegions } from "@/ui/live-regions";

import { SHELL_COPY } from "../copy";
import { MainLandmark } from "../main-landmark";
import { SkipLink } from "../skip-link";

const SCALE = { "--u": "min(1vw, 1.7778vh)" } as CSSProperties;

export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col" style={SCALE}>
      <SkipLink />
      <IncidentBanner />
      <MainLandmark className="flex flex-1 flex-col p-[5vmin] outline-none max-lg:hidden max-lg:has-[>[data-not-found]]:flex [@media(max-height:575px)]:hidden [@media(max-height:575px)]:has-[>[data-not-found]]:flex">
        {children}
      </MainLandmark>
      <p className="m-auto hidden max-w-md p-6 text-center text-lead max-lg:block [@media(max-height:575px)]:block [main:has(>[data-not-found])~&]:hidden">
        {SHELL_COPY.hostTooSmall}
      </p>
      <LiveRegions />
    </div>
  );
}
