"use client";

/**
 * The sync code on this device (§9.2): what `/me/sync`, the stop screen's
 * offer, the claim card's fallback and the iOS install pitch show.
 *
 * - The code lives on the device (`qz:sync`), so a code made here shows
 *   offline. A device without one asks the server for one only when the
 *   player taps Show my code: making a code ends any older one (AC-SYN-03),
 *   and a code the player wrote down elsewhere must not die unasked.
 * - A device whose identity the server has never seen (no Daily played)
 *   has nothing to move yet.
 * - "Make a new code" replaces the code everywhere (5 a day).
 * - Saving counts on "Copy code" or "I've saved it" (PRD §3.10.2): it is
 *   recorded on the device and logged as `sync_code_saved` with the
 *   trigger that offered the code.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { getBackend } from "@/backend";
import type { SyncCode } from "@/engine/types";
import { track } from "@/features/analytics/track";
import { getServerClock } from "@/platform/server-clock";

import { bootClient, onIdentityChange } from "../boot";
import { readDeviceIdentity } from "../device";
import { screenError, type ScreenError } from "../errors";
import type { SyncTrigger } from "../offers/eligibility";
import {
  markSyncCodeSaved,
  readSyncRecord,
  storeSyncCode,
} from "../sync-store";

export type SaveMethod = "copy" | "confirm";

export type SyncCodeView =
  | { phase: "loading" }
  /** No Daily played yet: nothing on the server to move. */
  | { phase: "no_profile" }
  | {
      phase: "none";
      /** A code made elsewhere may exist (a restored identity): Show my code ends it. */
      mayReplace: boolean;
      busy: boolean;
      error: ScreenError | null;
    }
  | {
      phase: "ready";
      code: SyncCode;
      saved: boolean;
      busy: boolean;
      error: ScreenError | null;
    };

export interface SyncCodeOptions {
  /** Ask for a code at once when the device has none (the tap was Show my code). */
  autoCreate?: boolean;
  /** After Copy code or I've saved it. */
  onSaved?: (method: SaveMethod) => void;
}

function settle(): SyncCodeView {
  const device = readDeviceIdentity();
  if (device === null || !device.registered) return { phase: "no_profile" };
  const record = readSyncRecord(device.playerId);
  const code = record?.code ?? null;
  if (record !== null && code !== null) {
    return {
      phase: "ready",
      code,
      saved: record.savedAt !== null,
      busy: false,
      error: null,
    };
  }
  return {
    phase: "none",
    mayReplace: device.source !== "minted",
    busy: false,
    error: null,
  };
}

export function useSyncCode(
  trigger: SyncTrigger,
  options: SyncCodeOptions = {},
) {
  const [view, setView] = useState<SyncCodeView>({ phase: "loading" });
  const onSaved = useRef(options.onSaved);
  useEffect(() => {
    onSaved.current = options.onSaved;
  });
  const autoCreate = options.autoCreate === true;
  const asked = useRef(false);

  const request = useCallback(async () => {
    setView((current) =>
      current.phase === "none" || current.phase === "ready"
        ? { ...current, busy: true, error: null }
        : current,
    );
    const backend = await getBackend();
    const result = await backend.identity.createSyncCode();
    const device = readDeviceIdentity();
    if (result.ok && device !== null) {
      storeSyncCode(device.playerId, result.value.code, result.value.createdAt);
      setView(settle());
      return;
    }
    const error = result.ok ? "generic" : screenError(result.error);
    setView((current) =>
      current.phase === "none" || current.phase === "ready"
        ? { ...current, busy: false, error }
        : current,
    );
  }, []);

  useEffect(() => {
    let live = true;
    const load = () => {
      void bootClient().then(() => {
        if (!live) return;
        const next = settle();
        setView(next);
        if (autoCreate && next.phase === "none" && !asked.current) {
          asked.current = true;
          void request();
        }
      });
    };
    load();
    // Another tab restored or replaced the player: show that player's code.
    const stop = onIdentityChange(load);
    return () => {
      live = false;
      stop();
    };
  }, [autoCreate, request]);

  const markSaved = useCallback(
    (method: SaveMethod) => {
      const device = readDeviceIdentity();
      if (device === null) return;
      markSyncCodeSaved(device.playerId, getServerClock().now());
      setView((current) =>
        current.phase === "ready" ? { ...current, saved: true } : current,
      );
      track("sync_code_saved", { trigger, method });
      onSaved.current?.(method);
    },
    [trigger],
  );

  return { view, request, markSaved };
}
