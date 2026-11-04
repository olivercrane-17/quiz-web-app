/**
 * The focus-mode header of every play screen (PRD §6.1, DESIGN §6.13):
 * Leave, the run's progress, and the end slot for the stopwatch and the
 * More menu. No tab bar. The incident banner slot sits under it.
 *
 * Play screens don't render it directly: `<PlayFrame header={...}>` puts it
 * before the screen's `<main>`, so it is the page's banner landmark and the
 * skip link jumps past it (WCAG 2.4.1). It shows the run's state, which only
 * the screen knows.
 *
 * 56 px tall over a 720 px column, sticky, on the page's own paper and
 * grain (`.kn-playbar` in shell.css), with the progress centred between
 * Leave and the end slot.
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
    <header className="kn-playbar kn-grain">
      <div className="kn-playbar-row">
        <Link
          href={leave.href as Route}
          aria-label={leave.label}
          onClick={leave.onLeave}
          className={buttonClasses({ variant: "icon" })}
        >
          <CrossIcon size={24} />
        </Link>
        <div className="kn-playbar-progress">{progress}</div>
        {end === undefined ? null : <div className="kn-playbar-end">{end}</div>}
      </div>
      <IncidentBanner />
    </header>
  );
}
