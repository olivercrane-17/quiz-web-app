/**
 * `qz:sync` (ARCHITECTURE §6.2): this device's side of moving a profile.
 *
 * - The sync code as `/me/sync` shows it (§9.2): the server keeps only its
 *   hash, so this copy is what lets the page work offline. A code restored
 *   here is stored too, since it still works.
 * - When the player saved it ("Copy code" or "I've saved it", PRD
 *   §3.10.2), which the sync offer's 10th-Daily trigger asks about.
 * - The claim link this device made, while it lasts (§9.5), so its own
 *   `/claim/<token>` page knows the profile is already here and never
 *   redeems its own token.
 *
 * The record belongs to one player: after a restore or a recovery that
 * changes the player, the old record is ignored, with nothing to clear by
 * hand. It holds no secret (a claim token is a ten-minute bearer link that
 * sits in this device's address bar anyway).
 */
import {
  parseClaimToken,
  parsePlayerId,
  parseSyncCode,
  type ClaimToken,
  type EpochMs,
  type PlayerId,
  type SyncCode,
} from "@/engine/types";
import { getKv, type Kv } from "@/platform/storage";

export const SYNC_KEY = "qz:sync";

export interface SyncRecord {
  v: 1;
  playerId: PlayerId;
  /** Normalized, without hyphens; null until a code reached this device. */
  code: SyncCode | null;
  codeCreatedAt: EpochMs | null;
  /** When the player saved this code; null if never. */
  savedAt: EpochMs | null;
  /** The claim link this device made, while it may still be live. */
  claim: { token: ClaimToken; expiresAt: EpochMs } | null;
}

function epochOrNull(value: unknown): EpochMs | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value)
    ? (value as EpochMs)
    : undefined;
}

/** A stored record, or null when the value is not one. */
export function decodeSyncRecord(raw: unknown): SyncRecord | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const playerId = parsePlayerId(record.playerId);
  const code = record.code === null ? null : parseSyncCode(record.code);
  const codeCreatedAt = epochOrNull(record.codeCreatedAt);
  const savedAt = epochOrNull(record.savedAt);
  let claim: SyncRecord["claim"] | undefined = null;
  if (record.claim !== null && record.claim !== undefined) {
    const entry = record.claim as Record<string, unknown>;
    const token = parseClaimToken(entry.token);
    const expiresAt = epochOrNull(entry.expiresAt);
    claim =
      token === null || expiresAt === null || expiresAt === undefined
        ? undefined
        : { token, expiresAt };
  }
  if (
    record.v !== 1 ||
    playerId === null ||
    (record.code !== null && code === null) ||
    codeCreatedAt === undefined ||
    savedAt === undefined ||
    claim === undefined
  ) {
    return null;
  }
  return { v: 1, playerId, code, codeCreatedAt, savedAt, claim };
}

/** The record of `playerId`, or null when this device keeps none for that player. */
export function readSyncRecord(
  playerId: PlayerId,
  kv: Kv = getKv(),
): SyncRecord | null {
  const record = kv.read(SYNC_KEY, decodeSyncRecord);
  return record !== null && record.playerId === playerId ? record : null;
}

function update(
  playerId: PlayerId,
  change: (record: SyncRecord) => SyncRecord,
  kv: Kv,
): void {
  const current = readSyncRecord(playerId, kv) ?? {
    v: 1,
    playerId,
    code: null,
    codeCreatedAt: null,
    savedAt: null,
    claim: null,
  };
  kv.write(SYNC_KEY, change(current));
}

/**
 * Stores the player's code as the server just made it, or as it was just
 * restored with (then `saved`, since the player evidently has it).
 */
export function storeSyncCode(
  playerId: PlayerId,
  code: SyncCode,
  createdAt: EpochMs,
  options: { savedAt?: EpochMs | null } = {},
  kv: Kv = getKv(),
): void {
  update(
    playerId,
    (record) => ({
      ...record,
      code,
      codeCreatedAt: createdAt,
      savedAt: options.savedAt ?? null,
    }),
    kv,
  );
}

/** "Copy code" or "I've saved it" (PRD §3.10.2). */
export function markSyncCodeSaved(
  playerId: PlayerId,
  at: EpochMs,
  kv: Kv = getKv(),
): void {
  update(playerId, (record) => ({ ...record, savedAt: at }), kv);
}

/**
 * When the player last saved their sync code on this device, or null. For
 * the stop screen (DLY-3), so a code saved at `/me/sync` counts as saved
 * for the sync offer's 10th-Daily trigger, as one saved from the offer does.
 */
export function syncCodeSavedAt(
  playerId: PlayerId,
  kv: Kv = getKv(),
): EpochMs | null {
  return readSyncRecord(playerId, kv)?.savedAt ?? null;
}

/** Remembers the claim link this device just made (§9.5). */
export function rememberClaim(
  playerId: PlayerId,
  claim: { token: ClaimToken; expiresAt: EpochMs },
  kv: Kv = getKv(),
): void {
  update(playerId, (record) => ({ ...record, claim }), kv);
}

/** True when `token` is the claim link this device made for `playerId`. */
export function isOwnClaim(
  playerId: PlayerId,
  token: ClaimToken,
  kv: Kv = getKv(),
): boolean {
  return readSyncRecord(playerId, kv)?.claim?.token === token;
}
