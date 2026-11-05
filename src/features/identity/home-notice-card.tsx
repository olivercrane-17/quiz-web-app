"use client";

/**
 * Today's restore note (DESIGN §12.1), loaded by `RestoreNotice` only when
 * a restore left one: after the client boot, it takes the note, checks the
 * device still holds the restored player, greets them by the cached
 * profile's name (`readCachedProfile`, which the restore filled) and says
 * it in the status region. A note for another player shows nothing.
 *
 * Shown once: the note stays while Today is on screen, and is said once.
 * Once the player leaves Today (Next hides the route and runs this card's
 * cleanups, or unmounts it), the note is over for this page load, so
 * coming back to Today shows and says nothing (`restoreNoticeStage`).
 */
import { useEffect, useLayoutEffect, useState } from "react";

import { readCachedProfile } from "@/platform/identity/profile";
import { announce } from "@/ui/announce";
import { Card } from "@/ui/card";
import { CheckIcon } from "@/ui/icons";

import { bootClient } from "./boot";
import { IDENTITY_CLIENT_COPY } from "./client-copy";
import { readDeviceIdentity } from "./device";
import {
  markRestoreNoticeOver,
  markRestoreNoticeShown,
  restoreNoticeStage,
  takeRestoreNotice,
} from "./restore-notice";

const COPY = IDENTITY_CLIENT_COPY.notice;

/** The note's words for what was restored, or null when it no longer applies. */
export function restoreNoticeText(): string | null {
  const entry = takeRestoreNotice();
  const device = readDeviceIdentity();
  if (entry === null || device?.playerId !== entry.playerId) return null;
  if (entry.kind === "claim") return COPY.claimed;
  const profile = readCachedProfile(entry.playerId);
  const name =
    profile === null ? null : (profile.nickname ?? profile.friendlyName);
  return COPY.synced(name, entry.streak);
}

export function RestoreNoticeCard() {
  const [text, setText] = useState<string | null>(null);

  // Leaving Today ends a note that showed; a layout cleanup, so a later
  // return never flashes it.
  useLayoutEffect(
    () => () => {
      if (restoreNoticeStage() !== "shown") return;
      markRestoreNoticeOver();
      setText(null);
    },
    [],
  );

  useEffect(() => {
    if (restoreNoticeStage() === "over") return;
    let live = true;
    void bootClient().then(() => {
      if (!live || restoreNoticeStage() === "over") return;
      const message = restoreNoticeText();
      if (message === null) return;
      setText(message);
      if (restoreNoticeStage() === "waiting") announce(message);
      markRestoreNoticeShown();
    });
    return () => {
      live = false;
    };
  }, []);

  if (text === null) return null;
  return (
    <Card data-restore-notice="" className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="inline-grid size-10 shrink-0 place-items-center rounded-xl bg-correct-tint text-correct-text"
      >
        <CheckIcon size={20} />
      </span>
      <p className="self-center text-body font-semibold">{text}</p>
    </Card>
  );
}
