/**
 * The `(play)` layout (ARCHITECTURE §2.1, PRD §6.1): focus mode, no tab
 * bar. Each play screen renders `<PlayHeader>` (Leave, progress, More)
 * first inside this `<main>`, since only the screen knows its run.
 * `src/app/(play)/layout.tsx` re-exports it.
 */
import type { ReactNode } from "react";

import { LiveRegions } from "@/ui/live-regions";

import { MAIN_ID } from "../landmarks";
import { SkipLink } from "../skip-link";

export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="flex w-full flex-1 flex-col outline-none"
      >
        {children}
      </main>
      <LiveRegions />
    </div>
  );
}
