/**
 * The focus-mode header of every play screen (PRD §6.1, DESIGN §6.13):
 * Leave, the run's progress, and the end slot for the stopwatch and the
 * More menu. No tab bar. The incident banner slot sits under it.
 *
 * Play screens don't render it directly: `<PlayFrame header={...}>` puts it
 * before the screen's `<main>`, so it is the page's banner landmark and the
 * skip link jumps past it (WCAG 2.4.1). It shows the run's state, which only
 * the screen knows.
 */
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { IncidentBanner } from "@/features/incidents/banner";
import { buttonClasses } from "@/ui/button-classes";
import { CrossIcon } from "@/ui/icons";

export interface PlayHeaderProps {
  leave: {
    /** Where Leave goes, usually where play started. */
    href: string;
    /** The full name, since only an X shows: "Leave the Daily. Your progress is saved". */
    label: string;
    /** Runs before the navigation, such as a save. Client components only. */
    onLeave?: () => void;
  };
  /** The run's progress, usually `<ProgressSegments>`. */
  progress?: ReactNode;
  /** The right end: the stopwatch and the More menu. */
  end?: ReactNode;
}

export function PlayHeader({ leave, progress, end }: PlayHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-14 w-full max-w-[720px] items-center gap-2 px-2">
        <Link
          href={leave.href as Route}
          aria-label={leave.label}
          onClick={leave.onLeave}
          className={buttonClasses({ variant: "icon" })}
        >
          <CrossIcon />
        </Link>
        <div className="min-w-0 flex-1">{progress}</div>
        {end === undefined ? null : (
          <div className="flex shrink-0 items-center gap-1">{end}</div>
        )}
      </div>
      <IncidentBanner />
    </header>
  );
}
