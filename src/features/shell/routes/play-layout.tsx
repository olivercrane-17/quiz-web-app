/**
 * The `(play)` layout (ARCHITECTURE §2.1, PRD §6.1): focus mode, no tab
 * bar. It holds the skip link and the live regions: each play screen
 * renders `<PlayFrame>` (from `@/features/shell`), its header (Leave,
 * progress, More) and then its `<main>`, since only the screen knows its
 * run. `src/app/(play)/layout.tsx` re-exports it.
 *
 * It also renders `StopwatchChoice`, which renders nothing and says
 * "Stopwatch hidden. Show it again from More." when the More menu hides
 * the stopwatch (R3-09). Here rather than in the play header, which the
 * shell's barrel carries to every route that imports it, Today included
 * (4.5 kB on Today's first load when it sat there).
 */
import type { ReactNode } from "react";

import { LiveRegions } from "@/ui/live-regions";

import { SkipLink } from "../skip-link";
import { StopwatchChoice } from "../stopwatch-choice";

export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      {children}
      <LiveRegions />
      <StopwatchChoice />
    </div>
  );
}
