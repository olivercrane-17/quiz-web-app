"use client";

/**
 * The running time on Today's Continue card (RITE round 4, R4-04): beside
 * "Your stopwatch is still running.", the time itself, ticking as the play
 * header ticks. It is plain text, never a live region, so a screen reader
 * reads it on reaching the card and hears nothing as it turns; and it is
 * absent for a player who chose Hide stopwatch, as the header's is.
 *
 * Loaded by the card with import(), only for a run whose round is open, so
 * Home's eager card carries none of it (§10.9 item 2).
 */
import { useCallback, useSyncExternalStore } from "react";

import { getBackend } from "@/backend";
import type { AttemptId } from "@/engine/types";
import { bootClient } from "@/features/identity";
import { systemClock } from "@/platform/clock";
import { getServerClock } from "@/platform/server-clock";
import { getSettingsStore } from "@/platform/settings/store";

import { HOME_CARD_COPY } from "./home-copy";
import { awayClockMs, awayClockOf, type AwayClock } from "./model/away-clock";
import { formatStopwatch } from "./model/labels";
import { untilNextSecond } from "./screen/stopwatch";

function stopwatchHidden(): boolean {
  try {
    return getSettingsStore().get().stopwatch === "hidden";
  } catch {
    return false;
  }
}

/**
 * The open round's clock for the card, or null: the stopwatch is hidden,
 * nothing is counting after all, or the attempt couldn't be read (the card
 * then keeps its sentence alone).
 */
export async function loadAwayClock(
  attemptId: AttemptId,
): Promise<AwayClock | null> {
  if (stopwatchHidden()) return null;
  await bootClient();
  const backend = await getBackend();
  const snapshot = await backend.sealed.get(attemptId);
  if (!snapshot.ok) return null;
  return awayClockOf(snapshot.value, systemClock.now(), getServerClock().now());
}

/** "Time so far 1:12", the label for screen readers only, as on the header. */
export function AwayTime({ clock }: { clock: AwayClock }) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let timer: ReturnType<typeof setTimeout>;
      const arm = () => {
        timer = setTimeout(
          () => {
            onChange();
            arm();
          },
          untilNextSecond(awayClockMs(clock, systemClock.now())),
        );
      };
      arm();
      return () => {
        clearTimeout(timer);
      };
    },
    [clock],
  );
  const time = useSyncExternalStore(
    subscribe,
    () => formatStopwatch(awayClockMs(clock, systemClock.now())),
    () => formatStopwatch(awayClockMs(clock, clock.at)),
  );
  return (
    <span
      data-daily-clock-time=""
      // At least the room the card held for it (`w-[5ch]`).
      className="inline-block min-w-[5ch] font-semibold whitespace-nowrap tabular-nums"
    >
      <span className="sr-only">{HOME_CARD_COPY.runningTime} </span>
      {time}
    </span>
  );
}
