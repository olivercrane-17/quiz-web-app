/**
 * The `(tabs)` layout (ARCHITECTURE §2.1): the top bar, the page, and the
 * four-tab bar at the bottom on phones (in the top bar from 768 px). The
 * page is one centred column of 560 px content below 768 px and up to
 * 1,120 px from there (DESIGN §10.1); the top bar's row matches it.
 * `src/app/(tabs)/layout.tsx` re-exports it.
 *
 * The reading pages (`InfoLayout`) and the not-found page wear the same
 * frame: the tab bar hides only in play (PRD §6.1), and every page the
 * footer or a dead link opens keeps a way back to Today (RITE round 1,
 * R1-02). `column="reading"` narrows the page to the 640 px reading column
 * (DESIGN §12.40).
 *
 * On phones `.kn-tabs-main` (shell.css) keeps the last line clear of the
 * fixed tab bar by the bar's measured height (`ScrollInset`), so 200% text
 * and the safe area count.
 */
import type { ReactNode } from "react";

import { cx } from "@/ui/cx";
import { LiveRegions } from "@/ui/live-regions";

import { AppHeader, type HeaderColumn } from "../app-header";
import { MainLandmark } from "../main-landmark";
import { SkipLink } from "../skip-link";
import { TabBar } from "../tab-bar";

const COLUMNS: Record<HeaderColumn, string> = {
  page: "pt-2 md:max-w-page md:pt-4",
  reading: "pt-4 md:max-w-reading",
};

export function TabsFrame({
  column = "page",
  children,
}: {
  column?: HeaderColumn;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AppHeader column={column} />
      <MainLandmark
        className={cx(
          "kn-tabs-main mx-auto w-full max-w-narrow flex-1 px-gutter outline-none md:pb-10",
          COLUMNS[column],
        )}
      >
        {children}
      </MainLandmark>
      <TabBar placement="bottom" className="kn-tabbar md:hidden" />
      <LiveRegions />
    </div>
  );
}

export default function TabsLayout({ children }: { children: ReactNode }) {
  return <TabsFrame>{children}</TabsFrame>;
}
