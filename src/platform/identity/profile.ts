/**
 * `qz:profile` (ARCHITECTURE §6.2): the device's copy of the server profile
 * (friendly name, nickname, age band), so a screen can greet the player
 * before `get_profile` answers. The server is the truth; this is a cache.
 *
 * A cached profile counts only for the identity it was fetched for: a
 * restore, a claim or a recovery that changes the player makes the old copy
 * invisible at once, with nothing to clear by hand.
 */
import type { AgeBand, EpochMs, PlayerId, Profile } from "@/engine/types";
import { parsePlayerId } from "@/engine/types";
import { getKv, type Kv } from "@/platform/storage";

export const PROFILE_KEY = "qz:profile";

const AGE_BANDS: readonly AgeBand[] = ["under_13", "13_17", "18_plus"];
/** Generous caps: a cache that holds more was not written by us. */
const NAME_MAX = 64;

function shortText(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= NAME_MAX
  );
}

/** A stored profile, or null when the value is not one. */
export function decodeProfile(raw: unknown): Profile | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const playerId = parsePlayerId(record.playerId);
  const nickname = record.nickname ?? null;
  const ageBand = record.ageBand ?? null;
  const createdAt = record.createdAt;
  if (
    playerId === null ||
    !shortText(record.friendlyName) ||
    !(nickname === null || shortText(nickname)) ||
    !(ageBand === null || AGE_BANDS.includes(ageBand as AgeBand)) ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt)
  ) {
    return null;
  }
  return {
    playerId,
    friendlyName: record.friendlyName,
    nickname: nickname as string | null,
    ageBand: ageBand as AgeBand | null,
    createdAt: createdAt as EpochMs,
  };
}

/** The cached profile of `playerId`, or null when none is cached for that player. */
export function readCachedProfile(
  playerId: PlayerId,
  kv: Kv = getKv(),
): Profile | null {
  const cached = kv.read(PROFILE_KEY, decodeProfile);
  return cached !== null && cached.playerId === playerId ? cached : null;
}

/** Caches a profile the server just returned. */
export function cacheProfile(profile: Profile, kv: Kv = getKv()): void {
  if (decodeProfile(profile) !== null) kv.write(PROFILE_KEY, profile);
}
