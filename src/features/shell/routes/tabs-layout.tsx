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
        className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none md:pb-10"
      >
        {children}
      </main>
      <TabBar
        placement="bottom"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      />
      <LiveRegions />
    </div>
  );
}
