"use client";

/**
 * The Daily's stopwatch (PRD §3.1.3, DESIGN §6.7): total active time as
 * `m:ss`, drawn by the design system's `Stopwatch` (`@/ui/stopwatch`), so
 * it never speaks as it ticks (`aria-live="off"`), keeps its 36 px and its
 * type at 200% text, and drops its icon under 360 px. It runs only while a
 * round is open and freezes on reveals and between rounds, because that is
 * what breaks ties, and after a reload it picks up from the server's figure
 * (R1-06, `offset`). Each round the server resolves counts the time the
 * server recorded for it, and from Lock in the stopwatch stops on the
 * finish's total, the stop screen's time (R2-08, `total`).
 *
 * Round 3 (R3-01): it ticks on its own whole seconds rather than the wall
 * clock's, so it never reads behind the time it counts, and it stops the
 * moment an answer is sent, holding that value through the reveal.
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
import { useCallback, useSyncExternalStore, type Ref } from "react";

import type { RunState } from "@/engine/run";
import { systemClock } from "@/platform/clock";
import { Stopwatch as Watch } from "@/ui/stopwatch";

import { DAILY_SCREEN_COPY } from "../client-copy";
import { formatStopwatch, stopwatchMs, type TimeOffset } from "../model/labels";

function never(): () => void {
  return () => {};
}

/**
 * How long after the stopwatch's next whole second its tick fires: a timer
 * never fires early, so a little past the turn reads the new second.
 */
export const TICK_SLACK_MS = 4;

/**
 * The wait until the stopwatch's own next whole second (R3-01). Round 3
 * ticked once a second on the wall clock's seconds, so the header showed
 * the time at the last wall-clock second and could read up to a second
 * behind the time counted; with the rounding gap, that made the 2 s jumps
 * at Lock in.
 */
export function untilNextSecond(ms: number): number {
  return 1000 - (Math.max(0, ms) % 1000) + TICK_SLACK_MS;
}

export interface StopwatchProps {
  run: RunState;
  /** What the open round had before this page loaded (R1-06). */
  offset: TimeOffset | null;
  /**
   * The finish's official total once it is known: from Lock in on, the
   * stopwatch stops on it, so it reads what the stop screen will (R2-08).
   */
  total?: number | null;
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
  total = null,
  onOpenMenu,
  expanded,
  menuId,
  describedBy,
  buttonRef,
}: StopwatchProps) {
  // It runs only while a clue or the Encore is open: from the moment an
  // answer is sent it holds the value from the press (R3-01), and from Lock
  // in it stands on the finish's total.
  const live = total === null && run.phase === "active";
  const read = useCallback(
    (now: number) =>
      stopwatchMs(run, Math.max(now, run.updatedAt), offset, total),
    [run, offset, total],
  );
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!live) return never();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const arm = () => {
        timer = setTimeout(
          () => {
            onChange();
            arm();
          },
          untilNextSecond(read(systemClock.now())),
        );
      };
      arm();
      return () => {
        if (timer !== null) clearTimeout(timer);
      };
    },
    [live, read],
  );
  const time = useSyncExternalStore(
    subscribe,
    () => formatStopwatch(read(systemClock.now())),
    () => formatStopwatch(read(0)),
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
