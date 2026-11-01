"use client";

/**
 * The Daily's stopwatch (PRD §3.1.3, DESIGN §6.7): total active time as
 * `m:ss` in tabular figures, `aria-live="off"` so it never interrupts. It
 * runs only while a round is open and freezes on reveals and between
 * rounds, because that is what breaks ties. The screen hides it when the
 * player chose "Hide stopwatch" (DLY-2 adds the control; the stored
 * setting already applies).
 */
import { useSyncExternalStore } from "react";

import type { RunState } from "@/engine/run";
import { systemClock } from "@/platform/clock";

import { DAILY_SCREEN_COPY } from "../client-copy";
import { elapsedMs, formatStopwatch } from "../model/labels";

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

export function Stopwatch({ run }: { run: RunState }) {
  const live = run.phase === "active" || run.phase === "judging";
  const now = useSyncExternalStore(live ? everySecond : never, second, () => 0);
  return (
    <p
      aria-live="off"
      data-stopwatch=""
      className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm font-semibold text-muted-foreground tabular-nums"
    >
      <span className="sr-only">{DAILY_SCREEN_COPY.stopwatch} </span>
      {formatStopwatch(elapsedMs(run, Math.max(now, run.updatedAt)))}
    </p>
  );
}
