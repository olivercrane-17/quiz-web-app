/**
 * What this device holds, as the identity screens need it (§9.2, §9.5):
 * the stored identity's public facts (never its secret) and whether the
 * device has progress of its own, which puts a confirm step before a
 * restore or a claim replaces it.
 *
 * Call these after `bootClient()`, which settles `qz:identity` first.
 */
import { decodeLocalIdentity, IDENTITY_KEY } from "@/platform/identity/local";
import type { LocalIdentity, PlayerId } from "@/engine/types";
import { getKv, type Kv } from "@/platform/storage";

/** The stored identity without its secret. */
export interface DeviceIdentity {
  playerId: PlayerId;
  registered: boolean;
  source: LocalIdentity["source"];
}

/**
 * The identity this device stores, or null while it has none stored (one
 * minted while the backup cookie couldn't be asked lives in memory, and
 * has nothing on the server to move).
 */
export function readDeviceIdentity(kv: Kv = getKv()): DeviceIdentity | null {
  const stored = kv.read(IDENTITY_KEY, decodeLocalIdentity, {
    quarantine: false,
  });
  if (stored === null) return null;
  return {
    playerId: stored.playerId,
    registered: stored.registered,
    source: stored.source,
  };
}

/** Practice's finished runs (PRA-1's `qz:history`) hold at least one. */
export function hasLocalHistory(kv: Kv = getKv()): boolean {
  const raw = kv.readRaw("qz:history");
  return raw.state === "ok" && Array.isArray(raw.value) && raw.value.length > 0;
}

/**
 * True when the device has progress of its own (§9.2): its identity is
 * registered, or its practice history isn't empty.
 */
export function deviceHasProgress(kv: Kv = getKv()): boolean {
  return readDeviceIdentity(kv)?.registered === true || hasLocalHistory(kv);
}
