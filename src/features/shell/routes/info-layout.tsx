/**
 * The `(info)` layout (ARCHITECTURE §2.1, DESIGN §12.40): a readable
 * layout for the legal and trust pages, a 640 px reading column under a
 * minimal header. `src/app/(info)/layout.tsx` re-exports it.
 */
import type { ReactNode } from "react";

import { LiveRegions } from "@/ui/live-regions";

import { MAIN_ID } from "../landmarks";
import { SkipLink } from "../skip-link";
import { Wordmark } from "../wordmark";

export default function InfoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-14 w-full max-w-[640px] items-center px-4">
          <Wordmark />
        </div>
      </header>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-[640px] flex-1 px-4 py-8 outline-none"
      >
        {children}
      </main>
      <LiveRegions />
    </div>
  );
}
