/**
 * Switching the device to a restored identity (§9.2, §9.5, §9.6): stored,
 * told to every tab, the tab's own boot identity included, and posted to
 * the backup cookie; nothing at all under the Under 13 flag.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EpochMs, LocalIdentity } from "@/engine/types";
import type { BackupTransport } from "@/platform/identity/backup";
import type { IdentityChannel } from "@/platform/identity/broadcast";
import { mintIdentity } from "@/platform/identity/local";
import { createKv, createMemoryStorage } from "@/platform/storage";

import { bootDevice, resetDevice, storedIdentity } from "./__fixtures__/device";
import { onIdentityChange } from "./boot";
import { finishRestore } from "./restore-flow";
import { adoptIdentity } from "./switch";

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

describe("finishRestore", () => {
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
