"use client";

/**
 * The Daily's stopwatch (PRD §3.1.3, DESIGN §6.7): total active time as
 * `m:ss`, drawn by the design system's `Stopwatch` (`@/ui/stopwatch`), so
 * it never speaks as it ticks (`aria-live="off"`), keeps its 36 px and its
 * type at 200% text, and drops its icon under 360 px. It runs only while a
 * round is open and freezes on reveals and between rounds, because that is
 * what breaks ties, and after a reload it picks up from the server's figure
 * (R1-06, `offset`).
 *
 * It is a button: tapping it opens the More menu at "Hide stopwatch"
 * (DESIGN §6.7, R1-05), so the way to hide it is where the eye already is.
 * As a button the primitive draws its pill on a `rule` border; a plain
 * reading would have no edge (R1-27). In a first Daily the screen's hint,
 * "Take your time. Time only breaks ties.", is its accessible description
 * (`describedBy`), so a screen reader hears the hint on the stopwatch
 * itself (R1-05). Its name holds the visible time (WCAG 2.5.3): "Time so
 * far 1:12". The screen hides the whole stopwatch when the player chose
 * "Hide stopwatch".
 */
import { useSyncExternalStore, type Ref } from "react";

import type { RunState } from "@/engine/run";
import { systemClock } from "@/platform/clock";
import { Stopwatch as Watch } from "@/ui/stopwatch";

import { DAILY_SCREEN_COPY } from "../client-copy";
import { elapsedMs, formatStopwatch, type TimeOffset } from "../model/labels";

function everySecond(onChange: () => void): () => void {
  const timer = setInterval(onChange, 1000);
  return () => {
    clearInterval(timer);
  };
}

function never(): () => void {
  return () => {};
}

/** The current second: the same value until it turns, so renders stay put. */
const second = () => Math.floor(systemClock.now() / 1000) * 1000;

export interface StopwatchProps {
  run: RunState;
  /** What the open round had before this page loaded (R1-06). */
  offset: TimeOffset | null;
  /** Opens the More menu at "Hide stopwatch". */
  onOpenMenu(opener: HTMLElement): void;
  /** The More menu is open from here. */
  expanded: boolean;
  menuId: string;
  /** The id of the first-Daily hint beside it, which describes it. */
  describedBy?: string;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function Stopwatch({
  run,
  offset,
  onOpenMenu,
  expanded,
  menuId,
  describedBy,
  buttonRef,
}: StopwatchProps) {
  const live = run.phase === "active" || run.phase === "judging";
  const now = useSyncExternalStore(live ? everySecond : never, second, () => 0);
  const time = formatStopwatch(
    elapsedMs(run, Math.max(now, run.updatedAt), offset),
  );
  return (
    <Watch
      ref={buttonRef}
      time={time}
      label={DAILY_SCREEN_COPY.stopwatch}
      aria-haspopup="menu"
      aria-expanded={expanded}
      aria-controls={expanded ? menuId : undefined}
      aria-describedby={describedBy}
      onClick={(event) => {
        onOpenMenu(event.currentTarget);
      }}
    />
  );
}
