"use client";

/**
 * Says so when the player hides the stopwatch (RITE rounds 2 and 3, R2-29
 * and R3-09): "Stopwatch hidden. Show it again from More." Hide stopwatch
 * removed it without a word, so a screen reader heard focus land on More
 * and nothing about what had changed.
 *
 * The play header renders it beside its end slot, where the stopwatch and
 * the More menu live; the screen keeps the choice in the settings store,
 * and this listens there, so the screen needs no change of its own. It
 * speaks only for a change made while it is mounted, so loading a Daily
 * with the stopwatch already hidden says nothing. A hidden route's copy
 * stops listening as Next hides it (its effects are cleaned up), so one
 * choice is said once. It renders nothing.
 */
import { useEffect } from "react";

import { getSettingsStore } from "@/platform/settings/store";
import { announce } from "@/ui/announce";

import { SHELL_PLAY_COPY } from "./play-copy";

export function StopwatchChoice() {
  useEffect(() => {
    const store = getSettingsStore();
    let shown = store.get().stopwatch !== "hidden";
    return store.subscribe((settings) => {
      const now = settings.stopwatch !== "hidden";
      if (shown && !now) announce(SHELL_PLAY_COPY.stopwatchHidden);
      shown = now;
    });
  }, []);
  return null;
}
