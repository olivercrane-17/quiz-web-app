/**
 * The `(play)` layout (ARCHITECTURE §2.1, PRD §6.1): focus mode, no tab
 * bar. It holds the skip link and the live regions only: each play screen
 * renders `<PlayFrame>` (from `@/features/shell`), its header (Leave,
 * progress, More) and then its `<main>`, since only the screen knows its
 * run. `src/app/(play)/layout.tsx` re-exports it.
 */
import type { ReactNode } from "react";

import { LiveRegions } from "@/ui/live-regions";

import { SkipLink } from "../skip-link";

export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      {children}
      <LiveRegions />
    </div>
  );
}
