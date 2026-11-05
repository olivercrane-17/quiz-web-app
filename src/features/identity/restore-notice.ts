/**
 * The note Today shows once after a restore (DESIGN §12.1): "Welcome back,
 * Plucky Otter. Your 23-day streak is here." after a sync code, "You're all
 * set. Your streak is safe in this browser." after a claim. A silent
 * backup-cookie restore leaves none (AC-CKE-02).
 *
 * The restore leaves it in session storage (`qz:restore-notice`, this tab
 * only) just before it loads Today; Today's `RestoreNotice` takes it once
 * per page load. The friendly name comes from the cached profile
 * (`readCachedProfile`), which the restore fills, and the note shows only
 * while the device's identity is still the restored player.
 *
 * Today's first load carries only `notice-flag.ts`; this module loads with
 * the note's card.
 */
import { parsePlayerId, type PlayerId } from "@/engine/types";

import { RESTORE_NOTICE_KEY } from "./notice-flag";

export { RESTORE_NOTICE_KEY } from "./notice-flag";

export interface RestoreNoticeEntry {
  v: 1;
  kind: "sync" | "claim";
  playerId: PlayerId;
  /** The streak the restore answered. */
  streak: number;
}

/** The slice of sessionStorage the note uses. */
export interface NoticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function sessionStore(): NoticeStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function decode(text: string | null): RestoreNoticeEntry | null {
  if (text === null) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown> | null;
    const playerId = parsePlayerId(raw?.playerId);
    const streak = raw?.streak;
    if (
      raw?.v !== 1 ||
      (raw.kind !== "sync" && raw.kind !== "claim") ||
      playerId === null ||
      typeof streak !== "number" ||
      !Number.isInteger(streak) ||
      streak < 0
    ) {
      return null;
    }
    return { v: 1, kind: raw.kind, playerId, streak };
  } catch {
    return null;
  }
}

/** Leaves the note for Today's next render in this tab. */
export function leaveRestoreNotice(
  entry: RestoreNoticeEntry,
  storage: NoticeStorage | null = sessionStore(),
): void {
  try {
    storage?.setItem(RESTORE_NOTICE_KEY, JSON.stringify(entry));
  } catch {
    // A full or blocked session store only loses the note.
  }
}

let taken: { entry: RestoreNoticeEntry | null } | null = null;

/**
 * Takes the waiting note, once per page load: it leaves storage, so it
 * shows once, and a second call (React's development remount) gets the
 * same answer.
 */
export function takeRestoreNotice(
  storage: NoticeStorage | null = sessionStore(),
): RestoreNoticeEntry | null {
  if (taken !== null) return taken.entry;
  let entry: RestoreNoticeEntry | null = null;
  try {
    entry = decode(storage?.getItem(RESTORE_NOTICE_KEY) ?? null);
    storage?.removeItem(RESTORE_NOTICE_KEY);
  } catch {
    entry = null;
  }
  taken = { entry };
  return entry;
}

/**
 * Where the note stands in this page load: not yet on screen, on screen
 * (its words already said), or over, once Today was left while it showed.
 * Next keeps Today mounted but hidden while the player is elsewhere and
 * runs its effects again when it comes back, so the card asks this
 * instead of its own state: the note shows, and is said, once.
 */
export type RestoreNoticeStage = "waiting" | "shown" | "over";

let stage: RestoreNoticeStage = "waiting";

export function restoreNoticeStage(): RestoreNoticeStage {
  return stage;
}

/** The card put the note on screen and said it. */
export function markRestoreNoticeShown(): void {
  if (stage === "waiting") stage = "shown";
}

/** Today was left while the note showed: it doesn't come back. */
export function markRestoreNoticeOver(): void {
  if (stage === "shown") stage = "over";
}

/** Tests only: forget what this page load took and showed. */
export function resetRestoreNoticeForTests(): void {
  taken = null;
  stage = "waiting";
}
