/**
 * The top bar of the tab pages and the reading pages (DESIGN §6.13): the
 * wordmark, the text tabs from 768 px, the streak chip and Settings at the
 * right, then the incident banner slot under it. 56 px tall (50 on short
 * phones), sticky, on the page's own paper and grain (`.kn-topbar` in
 * shell.css). Its height is the page's top scroll inset (`ScrollInset`).
 *
 * Beside the wordmark sits the slot for a page's own title: on phones,
 * every tab page but Today shows its title there in place of the wordmark,
 * through `TopBarTitle` (from `@/features/shell/client`).
 */
import type { Route } from "next";
import Link from "next/link";

import { IncidentBanner } from "@/features/incidents/banner";
import { StreakChip } from "@/features/streaks/chip";
import { buttonClasses } from "@/ui/button-classes";
import { SettingsIcon } from "@/ui/icons";

import { SHELL_COPY } from "./copy";
import { ScrollInset } from "./scroll-inset";
import { TabBar } from "./tab-bar";
import { Wordmark } from "./wordmark";

/**
 * One bar for every page that wears it (DESIGN §6.13): its row and the
 * banners under it keep the page's column, 1,120 px from 768 px, on the
 * reading pages too, which narrow only their content to 640 px (§10.1,
 * §12.40). So opening a footer link moves no tab and no button sideways.
 */
export function AppHeader({
  markTab = true,
}: {
  /** False on a page that belongs to no tab (`TabBar`'s `marked`). */
  markTab?: boolean;
}) {
  return (
    <header className="kn-topbar kn-grain">
      <ScrollInset edge="top" />
      <div className="kn-topbar-row">
        <Wordmark />
        {/* TOP_BAR_TITLE_SLOT (./landmarks): TopBarTitle portals into it. */}
        <div data-topbar-title="" className="kn-topbar-title" />
        <TabBar
          placement="top"
          marked={markTab}
          className="kn-toptabs ml-4 hidden md:block"
        />
        <div className="kn-topbar-end">
          <StreakChip />
          <Link
            // A placeholder until SET-1 builds it. Prefetched like every
            // page that exists, so its title lands with it for the route
            // announcer (R1-09).
            href={"/settings" as Route}
            aria-label={SHELL_COPY.settings}
            className={buttonClasses({ variant: "icon" })}
          >
            <SettingsIcon size={24} />
          </Link>
        </div>
      </div>
      <IncidentBanner />
    </header>
  );
}
