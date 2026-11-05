/**
 * Switching the device to a restored identity (§9.2, §9.5, §9.6): stored,
 * told to every tab, the tab's own boot identity included, and posted to
 * the backup cookie; nothing at all under the Under 13 flag. A switch to
 * another player leaves no working code for the old one behind.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EpochMs, LocalIdentity } from "@/engine/types";
import type { BackupTransport } from "@/platform/identity/backup";
import type { IdentityChannel } from "@/platform/identity/broadcast";
import { mintIdentity } from "@/platform/identity/local";
import { createKv, createMemoryStorage } from "@/platform/storage";

import { parseSyncCode, type SyncCode } from "@/engine/types";

import { bootDevice, resetDevice, storedIdentity } from "./__fixtures__/device";
import { onIdentityChange } from "./boot";
import { finishRestore, type FinishRestoreInput } from "./restore-flow";
import { adoptIdentity } from "./switch";
import { SYNC_KEY, readSyncRecord, storeSyncCode } from "./sync-store";

const AT = Date.UTC(2026, 10, 5, 9) as EpochMs;

afterEach(() => {
  resetDevice();
});

function restored(): LocalIdentity {
  return {
    ...mintIdentity(AT),
    registered: true,
    source: "sync",
  };
}

function fakeBackup(): BackupTransport & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    restore: () => Promise.resolve({ kind: "none" }),
    save: (credential) => {
      saved.push(credential);
      return Promise.resolve("saved");
    },
    remove: () => Promise.resolve(true),
  };
}

function fakeChannel(): IdentityChannel & { announced: number } {
  const channel = {
    announced: 0,
    announce() {
      channel.announced += 1;
    },
    listen: () => () => {},
    close() {},
  };
  return channel;
}

describe("adoptIdentity", () => {
  it("stores the identity, tells the other tabs and posts the backup cookie, stamping it", async () => {
    const kv = createKv({ storage: createMemoryStorage() });
    const old = { ...mintIdentity(AT), registered: true };
    kv.write("qz:identity", old);
    const backup = fakeBackup();
    const channel = fakeChannel();
    const next = restored();
    const stored = await adoptIdentity(next, {
      kv,
      backup,
      channel,
      now: () => AT,
    });
    expect(stored).toBe(true);
    expect(backup.saved).toEqual([
      { playerId: next.playerId, secret: next.secret },
    ]);
    expect(channel.announced).toBeGreaterThanOrEqual(1);
    expect(kv.read("qz:identity", (raw) => raw)).toEqual({
      ...next,
      cookieSavedAt: AT,
    });
  });

  it("changes nothing on a device that keeps no identity (Under 13)", async () => {
    const kv = createKv({ storage: createMemoryStorage() });
    kv.write("qz:under13", { since: AT });
    const backup = fakeBackup();
    const stored = await adoptIdentity(restored(), {
      kv,
      backup,
      channel: null,
    });
    expect(stored).toBe(false);
    expect(kv.readRaw("qz:identity")).toEqual({ state: "missing" });
    expect(backup.saved).toEqual([]);
  });

  it("lets the caller move on when the cookie route is slow", async () => {
    const kv = createKv({ storage: createMemoryStorage() });
    const backup: BackupTransport = {
      ...fakeBackup(),
      save: () => new Promise(() => {}),
    };
    const stored = await adoptIdentity(restored(), {
      kv,
      backup,
      channel: null,
      waitMs: 10,
    });
    expect(stored).toBe(true);
  });

  it.runIf(typeof BroadcastChannel !== "undefined")(
    "the tab's own boot identity follows the switch",
    async () => {
      await bootDevice({ registered: true });
      const changed = vi.fn();
      const stop = onIdentityChange(changed);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const next = restored();
      await adoptIdentity(next, { backup: null });
      await vi.waitFor(() => {
        expect(changed).toHaveBeenCalledWith(
          expect.objectContaining({ playerId: next.playerId }),
        );
      });
      stop();
    },
  );
});

/** What a redemption answered for `next`. */
function answer(
  next: LocalIdentity,
  source: FinishRestoreInput["source"],
): FinishRestoreInput {
  return {
    restored: {
      playerId: next.playerId,
      profile: {
        playerId: next.playerId,
        friendlyName: "Plucky Otter",
        nickname: null,
        ageBand: null,
        createdAt: AT,
      },
      streak: { current: 3, best: 3 },
      lastDaily: null,
    },
    secret: next.secret,
    source,
  };
}

const OLD_CODE = parseSyncCode("K7QX2M9PT4RW8HNC") as SyncCode;

describe("finishRestore", () => {
  it("after a claim, drops the old player's sync code from the device", async () => {
    await bootDevice({ registered: true });
    const old = storedIdentity();
    if (old === null) throw new Error("no identity");
    storeSyncCode(old.playerId, OLD_CODE, AT, { savedAt: AT });
    const next = restored();
    const navigate = vi.fn();
    const done = await finishRestore(answer(next, "claim"), {
      navigate,
      backup: null,
    });
    expect(done).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/");
    expect(storedIdentity()?.playerId).toBe(next.playerId);
    // Nothing of the old profile's pass is left in storage.
    expect(localStorage.getItem(SYNC_KEY)).toBeNull();
    expect(readSyncRecord(old.playerId)).toBeNull();
  });

  it("after a sync code, keeps only the restored code, already saved", async () => {
    await bootDevice({ registered: true });
    const old = storedIdentity();
    if (old === null) throw new Error("no identity");
    storeSyncCode(old.playerId, OLD_CODE, AT);
    const next = restored();
    const code = parseSyncCode("0000111122223333") as SyncCode;
    await finishRestore(
      { ...answer(next, "sync"), code },
      { navigate: vi.fn(), backup: null },
    );
    expect(readSyncRecord(next.playerId)).toMatchObject({ code });
    expect(readSyncRecord(next.playerId)?.savedAt).not.toBeNull();
    expect(localStorage.getItem(SYNC_KEY)).not.toContain(OLD_CODE);
  });

  it("does nothing more when the device keeps no identity", async () => {
    await bootDevice();
    localStorage.setItem("qz:under13", JSON.stringify({ since: AT }));
    const navigate = vi.fn();
    const next = restored();
    const done = await finishRestore(
      {
        restored: {
          playerId: next.playerId,
          profile: {
            playerId: next.playerId,
            friendlyName: "Plucky Otter",
            nickname: null,
            ageBand: null,
            createdAt: AT,
          },
          streak: { current: 3, best: 3 },
          lastDaily: null,
        },
        secret: next.secret,
        source: "sync",
      },
      { navigate, backup: null },
    );
    expect(done).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(storedIdentity()?.playerId).not.toBe(next.playerId);
    expect(sessionStorage.getItem("qz:restore-notice")).toBeNull();
  });
});
