"use client";

/**
 * The confirm step before a restore or a claim replaces a device's own
 * progress (PRD §3.10.2, §3.10.4; ARCHITECTURE §9.2): "This device has its
 * own progress (streak 2). Restoring replaces it with the profile from
 * your code." with the line on what moves (AC-SYN-07). Cancel keeps the
 * device's identity (AC-SYN-06). There is no merge in v1.
 *
 * A device whose only progress is practice (it never played a Daily, so
 * its identity is unregistered) loses nothing: its practice stays. Its
 * confirm says so instead of "replaces", and the line on what moves
 * still follows.
 *
 * A dialog (DESIGN §6.10): the confirm first, Cancel beside it.
 */
import { useEffect, useState } from "react";

import { getBackend } from "@/backend";
import { parseTimeZone, type StreakState } from "@/engine/types";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";

import { bootClient } from "./boot";
import { IDENTITY_CLIENT_COPY } from "./client-copy";

const COPY = IDENTITY_CLIENT_COPY;

/** The streak a surface shows (PRD §4.4.3 step 6): the pre-break count while paused. */
function shownStreak(state: StreakState): number {
  return state.display === "paused"
    ? (state.paused?.streak ?? 0)
    : state.current;
}

/**
 * The device's own streak for the confirm copy, fetched in the background
 * while `enabled`, so it is there by the time the player confirms; null
 * when unknown, and the copy leaves it out.
 */
export function useDeviceStreak(enabled: boolean): number | null {
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      await bootClient();
      const zone =
        parseTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ??
        parseTimeZone("UTC");
      if (zone === null) return;
      const backend = await getBackend();
      const result = await backend.streaks.get(zone);
      if (live && result.ok) setStreak(shownStreak(result.value));
    })();
    return () => {
      live = false;
    };
  }, [enabled]);
  return streak;
}

export interface ConfirmReplaceProps {
  open: boolean;
  /** The device's own streak, when known. */
  streak: number | null;
  /**
   * Whether the device's identity has played here (it is registered);
   * false when its only progress is practice, which stays.
   */
  registered: boolean;
  /** A sync code, or a claim link. */
  via: "code" | "link";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmReplace({
  open,
  streak,
  registered,
  via,
  onConfirm,
  onCancel,
}: ConfirmReplaceProps) {
  return (
    <Dialog
      open={open}
      title={
        registered
          ? COPY.restore.confirmTitle
          : COPY.restore.confirmTitlePractice(via)
      }
      description={
        registered
          ? COPY.restore.confirmBody(streak, via)
          : COPY.restore.confirmBodyPractice(via)
      }
      onClose={onCancel}
      actions={
        <>
          <Button variant="primary" onClick={onConfirm}>
            {via === "code"
              ? COPY.restore.confirmAction
              : COPY.claimPage.continue}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {COPY.cancel}
          </Button>
        </>
      }
    >
      <p className="text-body-sm text-ink-2" data-what-moves="">
        {COPY.whatMoves}
      </p>
    </Dialog>
  );
}
