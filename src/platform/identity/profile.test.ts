import { describe, expect, it } from "vitest";

import type { EpochMs, Profile } from "@/engine/types";
import { createKv, createMemoryStorage } from "@/platform/storage";

import { mintIdentity } from "./local";
import {
  PROFILE_KEY,
  cacheProfile,
  decodeProfile,
  readCachedProfile,
} from "./profile";

const NOW = Date.UTC(2026, 10, 1, 9) as EpochMs;

function profileOf(playerId: Profile["playerId"]): Profile {
  return {
    playerId,
    friendlyName: "Plucky Otter",
    nickname: null,
    ageBand: "18_plus",
    createdAt: NOW,
  };
}

describe("the cached profile (§6.2 qz:profile)", () => {
  it("round-trips for the identity it belongs to", () => {
    const kv = createKv({ storage: createMemoryStorage() });
    const { playerId } = mintIdentity(NOW);
    const profile = profileOf(playerId);
    cacheProfile(profile, kv);
    expect(readCachedProfile(playerId, kv)).toEqual(profile);
  });

  it("is invisible to any other identity, so a restore never shows the old one", () => {
    const kv = createKv({ storage: createMemoryStorage() });
    const before = mintIdentity(NOW).playerId;
    const after = mintIdentity(NOW).playerId;
    cacheProfile(profileOf(before), kv);
    expect(readCachedProfile(after, kv)).toBeNull();
  });

  it("decodes only profiles we write", () => {
    const good = profileOf(mintIdentity(NOW).playerId);
    expect(decodeProfile(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(decodeProfile({ ...good, nickname: "Quiz Whiz" })).toMatchObject({
      nickname: "Quiz Whiz",
    });
    for (const bad of [
      null,
      [],
      { ...good, playerId: "x" },
      { ...good, friendlyName: "" },
      { ...good, friendlyName: "x".repeat(65) },
      { ...good, nickname: 7 },
      { ...good, ageBand: "adult" },
      { ...good, createdAt: "today" },
    ]) {
      expect(decodeProfile(bad)).toBeNull();
    }
  });

  it("quarantines an unreadable cache and caches nothing malformed", () => {
    const storage = createMemoryStorage({ [PROFILE_KEY]: '{"playerId":1}' });
    const kv = createKv({ storage });
    expect(readCachedProfile(mintIdentity(NOW).playerId, kv)).toBeNull();
    expect(storage.getItem("qz:quarantine:profile")).toBe('{"playerId":1}');
    cacheProfile(
      { ...profileOf(mintIdentity(NOW).playerId), friendlyName: "" },
      kv,
    );
    expect(storage.getItem(PROFILE_KEY)).toBeNull();
  });
});
