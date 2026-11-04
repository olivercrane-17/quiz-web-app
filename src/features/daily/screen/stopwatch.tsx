"use client";

/**
 * The Daily's stopwatch (PRD §3.1.3, DESIGN §6.7): total active time as
 * `m:ss` in tabular figures, `aria-live="off"` so it never interrupts. It
 * runs only while a round is open and freezes on reveals and between
 * rounds, because that is what breaks ties, and after a reload it picks up
 * from the server's figure (R1-06, `offset`).
 *
 * It is a button: tapping it opens the More menu at "Hide stopwatch"
 * (DESIGN §6.7, R1-05), so the way to hide it is where the eye already is.
 * The timer icon shows only while the header has room for it, measured in
 * `rem` by the header's container query, so at 200% text or under 360 px
 * the digits keep their room (DESIGN §10.2, R1-03). The screen hides the
 * whole stopwatch when the player chose "Hide stopwatch".
 */
import { useSyncExternalStore, type Ref } from "react";

import type { RunState } from "@/engine/run";
import { systemClock } from "@/platform/clock";
import { cx } from "@/ui/cx";

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

/** Lucide's `timer` (ISC licence), drawn inline so the header loads no icon set. */
function TimerIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="14" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}

export interface StopwatchProps {
  run: RunState;
  /** What the open round had before this page loaded (R1-06). */
  offset: TimeOffset | null;
  /** Opens the More menu at "Hide stopwatch". */
  onOpenMenu(opener: HTMLElement): void;
  /** The More menu is open from here. */
  expanded: boolean;
  menuId: string;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function Stopwatch({
  run,
  offset,
  onOpenMenu,
  expanded,
  menuId,
  buttonRef,
}: StopwatchProps) {
  const live = run.phase === "active" || run.phase === "judging";
  const now = useSyncExternalStore(live ? everySecond : never, second, () => 0);
  const time = formatStopwatch(
    elapsedMs(run, Math.max(now, run.updatedAt), offset),
  );
  return (
    <button
      ref={buttonRef}
      type="button"
      // The name holds the visible time (WCAG 2.5.3): "Time so far 1:12".
      aria-label={`${DAILY_SCREEN_COPY.stopwatch} ${time}`}
      aria-live="off"
      aria-haspopup="menu"
      aria-expanded={expanded}
      aria-controls={expanded ? menuId : undefined}
      data-stopwatch=""
      onClick={(event) => {
        onOpenMenu(event.currentTarget);
      }}
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-sm font-semibold text-muted-foreground tabular-nums",
        "outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-foreground",
      )}
    >
      <TimerIcon className="hidden shrink-0 @min-[17rem]/status:block" />
      {time}
    </button>
  );
}
