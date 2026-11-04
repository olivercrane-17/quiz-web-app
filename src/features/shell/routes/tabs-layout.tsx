/**
 * The `(tabs)` layout (ARCHITECTURE §2.1): the top bar, the page, and the
 * four-tab bar at the bottom on phones (in the top bar from 768 px).
 * `src/app/(tabs)/layout.tsx` re-exports it.
 */
import type { ReactNode } from "react";

import { LiveRegions } from "@/ui/live-regions";

import { AppHeader } from "../app-header";
import { MAIN_ID } from "../landmarks";
import { SkipLink } from "../skip-link";
import { TabBar } from "../tab-bar";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AppHeader />
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-page flex-1 px-gutter pt-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none md:pt-4 md:pb-10"
      >
        {children}
      </main>
      <TabBar placement="bottom" className="kn-tabbar md:hidden" />
      <LiveRegions />
    </div>
  );
}
