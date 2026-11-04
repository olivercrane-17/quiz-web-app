/**
 * The top bar of the tab pages (DESIGN §6.13): the wordmark, the text tabs
 * from 768 px, the streak chip and Settings at the right, then the incident
 * banner slot under it. 56 px tall (50 on short phones), sticky, on the
 * page's own paper and grain (`.kn-topbar` in shell.css).
 */
import type { Route } from "next";
import Link from "next/link";

import { IncidentBanner } from "@/features/incidents/banner";
import { StreakChip } from "@/features/streaks/chip";
import { buttonClasses } from "@/ui/button-classes";
import { SettingsIcon } from "@/ui/icons";

import { SHELL_COPY } from "./copy";
import { TabBar } from "./tab-bar";
import { Wordmark } from "./wordmark";

export function AppHeader() {
  return (
    <header className="kn-topbar kn-grain">
      <div className="kn-topbar-row">
        <Wordmark />
        <TabBar placement="top" className="kn-toptabs ml-4 hidden md:block" />
        <div className="kn-topbar-end">
          <StreakChip />
          <Link
            // /settings is built by SET-1. No prefetch until it exists: a
            // prefetch of a missing route logs a 404. SET-1 turns it on with
            // its page (a one-line Touch, §12.3); PERF-1 is the backstop.
            href={"/settings" as Route}
            prefetch={false}
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
