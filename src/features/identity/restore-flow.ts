/**
 * What a restore does once the server said yes (§9.2, §9.5, §9.6), for a
 * sync code and a claim alike:
 *
 * 1. The device switches to the restored identity, with the new secret it
 *    minted for the redemption (`adoptIdentity`): stored, told to every
 *    tab, posted to the backup cookie. Its old identity stays on the
 *    server untouched.
 * 2. The profile the server answered is cached (`cacheProfile`), so Today
 *    can greet the player by name before any call; a restored code is
 *    kept too, already saved, since the player has it.
 * 3. Today gets its note (`leaveRestoreNotice`), `identity_restored` is
 *    logged, and Today loads afresh, so every island starts from the
 *    restored player.
 *
 * Practice history, mastery and the review queue stay where they are: they
 * belong to the device, not the profile (PRD §1.4).
 */
import type {
  EpochMs,
  PlayerId,
  RestoredProfile,
  Secret,
  SyncCode,
} from "@/engine/types";
import { track } from "@/features/analytics/track";
import { cacheProfile } from "@/platform/identity/profile";

import { leaveRestoreNotice } from "./restore-notice";
import { adoptIdentity, type AdoptOptions } from "./switch";
import { storeSyncCode } from "./sync-store";

export interface FinishRestoreInput {
  restored: RestoredProfile & { playerId: PlayerId };
  /** The secret the device minted and sent with the redemption. */
  secret: Secret;
  source: "sync" | "claim";
  /** The code it was restored with (sync only). */
  code?: SyncCode;
}

export interface FinishRestoreOptions extends AdoptOptions {
  /** Default: a full navigation to Today. */
  navigate?: (href: string) => void;
}

/**
 * Finishes a restore and loads Today. Resolves false, having changed
 * nothing, when the device keeps no identity (the Under 13 flag, §9.7).
 */
export async function finishRestore(
  input: FinishRestoreInput,
  options: FinishRestoreOptions = {},
): Promise<boolean> {
  const now = options.now ?? (() => Date.now() as EpochMs);
  const { restored, secret, source } = input;
  const stored = await adoptIdentity(
    {
      v: 1,
      playerId: restored.playerId,
      secret,
      registered: true,
      createdAt: now(),
      source,
      cookieSavedAt: null,
    },
    { ...options, now },
  );
  if (!stored) return false;
  cacheProfile(restored.profile);
  if (input.code !== undefined) {
    storeSyncCode(restored.playerId, input.code, now(), { savedAt: now() });
  }
  leaveRestoreNotice({
    v: 1,
    kind: source,
    playerId: restored.playerId,
    streak: restored.streak.current,
  });
  track("identity_restored", {
    source: source === "sync" ? "sync_code" : "claim",
  });
  (options.navigate ?? ((href) => window.location.assign(href)))("/");
  return true;
}
