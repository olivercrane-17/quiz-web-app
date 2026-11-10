/**
 * The focus-mode header of every play screen (PRD §6.1, DESIGN §6.13):
 * Leave, the run's progress, and the end slot for the stopwatch and the
 * More menu, then an optional full-width row under them. No tab bar. The
 * incident banner slot sits under it all.
 *
 * Play screens don't render it directly: `<PlayFrame header={...}>` puts it
 * before the screen's `<main>`, so it is the page's banner landmark and the
 * skip link jumps past it (WCAG 2.4.1). It shows the run's state, which only
 * the screen knows.
 *
 * The X shows only an icon, so what leaving does is its accessible name's
 * second sentence, and a tooltip under it says the same on hover and on
 * focus (RITE round 4, R4-04; `LeaveTip`, `.kn-playbar-tip`).
 *
 * 56 px tall over a 720 px column, sticky, on the page's own paper and
 * grain (`.kn-playbar` in shell.css), with the progress between Leave and
 * the end slot. Its height is the page's top scroll inset (`ScrollInset`),
 * the `below` row included, so a focused option never sits under it.
 *
 * - A practice round (DESIGN §12.7) passes its two-line title ("Practice"
 *   over the category) as `progress`, the sound toggle as `end` and its
 *   ten segments as `below`, which runs them the width of the column, at
 *   the page's gutters.
 * - Without `end`, the progress keeps the page's gutter on the right, as
 *   the Leave button's box keeps it on the left (RITE round 1, R1-36).
 * - The row never runs wider than the screen (R1-03): the progress shrinks
 *   first (the Daily's pills give up their spare width), and the end slot
 *   keeps its size.
 * - The stopwatch in its end slot renders nothing once its route is hidden
 *   (`@/ui/stopwatch`), so a results page carries no "Time so far" region
 *   (R3-09); hiding it is said aloud by the play layout's
 *   `StopwatchChoice`, not here, since this module reaches every route
 *   that imports the shell's barrel, Today included.
 */
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { IncidentBanner } from "@/features/incidents/banner";
import { buttonClasses } from "@/ui/button-classes";
import { CrossIcon } from "@/ui/icons";

import { LeaveTip } from "./leave-tip";
import { ScrollInset } from "./scroll-inset";

export interface PlayHeaderProps {
  leave: {
    /** Where Leave goes, usually where play started. */
    href: string;
    /** The full name, since only an X shows: "Leave the Daily. Your progress is saved". */
    label: string;
    /** Runs before the navigation, such as a save. Client components only. */
    onLeave?: () => void;
  };
  /** The middle of the row: the Daily's pills, or a title. */
  progress?: ReactNode;
  /** The right end: the stopwatch and the More menu, or the sound toggle. */
  end?: ReactNode;
  /** A row under the bar, the column's full width: practice's ten segments. */
  below?: ReactNode;
}

/**
 * What the X's tooltip says (R4-04): the label's second sentence, which is
 * what leaving does ("Your progress is saved, and the stopwatch keeps
 * running."). A label of one sentence only names the X and gets none.
 */
export function leaveTip(label: string): string | null {
  const cut = label.indexOf(". ");
  const rest = cut < 0 ? "" : label.slice(cut + 2).trim();
  return rest === "" ? null : rest;
}

export function PlayHeader({ leave, progress, end, below }: PlayHeaderProps) {
  const tip = leaveTip(leave.label);
  return (
    <header className="kn-playbar kn-grain">
      <ScrollInset edge="top" />
      <div
        className="kn-playbar-row"
        data-end={end === undefined ? "none" : undefined}
      >
        <span className="kn-playbar-leave">
          <Link
            href={leave.href as Route}
            aria-label={leave.label}
            onClick={leave.onLeave}
            className={buttonClasses({ variant: "icon" })}
          >
            <CrossIcon size={24} />
          </Link>
          {tip === null ? null : <LeaveTip>{tip}</LeaveTip>}
        </span>
        <div className="kn-playbar-progress">{progress}</div>
        {end === undefined ? null : <div className="kn-playbar-end">{end}</div>}
      </div>
      {below === undefined ? null : (
        <div className="kn-playbar-below">{below}</div>
      )}
      <IncidentBanner />
    </header>
  );
}
