/**
 * The top bar of the tab pages (DESIGN §6.13): the wordmark, the text tabs
 * from 768 px, the streak chip and settings, then the incident banner slot
 * under it.
 */
import type { Route } from "next";
import Link from "next/link";

import { IncidentBanner } from "@/features/incidents/banner";
import { StreakChip } from "@/features/streaks/chip";
import { buttonClasses } from "@/ui/button-classes";

import { SHELL_COPY } from "./copy";
import { TabBar } from "./tab-bar";
import { Wordmark } from "./wordmark";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-14 w-full max-w-[1120px] items-center gap-4 px-4">
        <Wordmark />
        <TabBar placement="top" className="hidden md:block" />
        <div className="ml-auto flex items-center gap-1">
          <StreakChip />
          <Link
            // /settings is built by SET-1. No prefetch until it exists: a
            // prefetch of a missing route logs a 404 (PERF-1 tunes this).
            href={"/settings" as Route}
            prefetch={false}
            className={buttonClasses({ variant: "ghost" })}
          >
            {SHELL_COPY.settings}
          </Link>
        </div>
      </div>
      <IncidentBanner />
    </header>
  );
}
