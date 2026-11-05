/**
 * The `(landing)` layout (ARCHITECTURE §2.1): a minimal header for deep
 * links (share, challenge, invite, claim, room and quiz landings), which
 * open as first visits with no prior state (PRD §6.1). One centred column:
 * 560 px of content below 768 px, the 720 px play column from there
 * (DESIGN §10.1), with the header's row and banners on the same column.
 * `src/app/(landing)/layout.tsx` re-exports it.
 */
import type { ReactNode } from "react";

import { IncidentBanner } from "@/features/incidents/banner";
import { LiveRegions } from "@/ui/live-regions";

import { MainLandmark } from "../main-landmark";
import { ScrollInset } from "../scroll-inset";
import { SkipLink } from "../skip-link";
import { Wordmark } from "../wordmark";

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="kn-topbar kn-grain" data-column="play">
        <ScrollInset edge="top" />
        <div className="kn-topbar-row">
          <Wordmark />
        </div>
        <IncidentBanner />
      </header>
      <MainLandmark className="mx-auto w-full max-w-narrow flex-1 px-gutter pt-2 pb-10 outline-none md:max-w-play">
        {children}
      </MainLandmark>
      <LiveRegions />
    </div>
  );
}
