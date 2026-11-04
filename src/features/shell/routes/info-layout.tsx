/**
 * The `(info)` layout (ARCHITECTURE §2.1, DESIGN §12.40): a readable
 * layout for the legal and trust pages, a 640 px reading column under a
 * minimal header (560 px of content below 768 px, DESIGN §10.1).
 * `src/app/(info)/layout.tsx` re-exports it.
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
      <header className="kn-topbar kn-grain" data-column="reading">
        <div className="kn-topbar-row">
          <Wordmark />
        </div>
      </header>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-narrow flex-1 px-gutter pt-4 pb-12 outline-none md:max-w-reading"
      >
        {children}
      </main>
      <LiveRegions />
    </div>
  );
}
