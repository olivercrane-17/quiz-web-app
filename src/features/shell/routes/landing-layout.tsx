/**
 * The `(landing)` layout (ARCHITECTURE §2.1): a minimal header for deep
 * links (share, challenge, invite, claim, room and quiz landings), which
 * open as first visits with no prior state (PRD §6.1).
 * `src/app/(landing)/layout.tsx` re-exports it.
 */
import type { ReactNode } from "react";

import { IncidentBanner } from "@/features/incidents/banner";
import { LiveRegions } from "@/ui/live-regions";

import { MAIN_ID } from "../landmarks";
import { SkipLink } from "../skip-link";
import { Wordmark } from "../wordmark";

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-14 w-full max-w-[720px] items-center px-4">
          <Wordmark />
        </div>
        <IncidentBanner />
      </header>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6 outline-none"
      >
        {children}
      </main>
      <LiveRegions />
    </div>
  );
}
