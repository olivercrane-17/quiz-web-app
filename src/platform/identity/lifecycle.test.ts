import { afterEach, describe, expect, it, vi } from "vitest";

import type { EpochMs, LocalIdentity } from "@/engine/types";
import { createKv, createMemoryStorage } from "@/platform/storage";

import type { BackupTransport, RestoreOutcome } from "./backup";
import {
  createIdentityChannel,
  type ChannelLike,
  type IdentityChannel,
} from "./broadcast";
import type { BackupCredential } from "./cookie";
import {
  loadIdentity,
  type LocksLike,
  type ManagedIdentity,
  type OnlineEventSource,
} from "./lifecycle";
import { IDENTITY_KEY, IDENTITY_LOCK, mintIdentity } from "./local";

const NOW = Date.UTC(2026, 10, 1, 9) as EpochMs;
const DAY = 24 * 60 * 60 * 1000;

/** A backup whose restore answers come from a queue (the last one repeats). */
function fakeBackup(...answers: RestoreOutcome[]) {
  const saved: BackupCredential[] = [];
  let restores = 0;
  const backup: BackupTransport = {
    restore() {
      restores += 1;
      const answer =
        answers.length > 1 ? answers.shift() : (answers[0] ?? undefined);
      return Promise.resolve(answer ?? { kind: "none" });
    },
    save(credential) {
      saved.push(credential);
      return Promise.resolve(true);
    },
    remove: () => Promise.resolve(true),
  };
  return {
    backup,
    saved,
    get restores() {
      return restores;
    },
  };
}

/** A lock manager that runs one callback at a time, recording the names asked for. */
function fakeLocks() {
  const names: string[] = [];
  let held: Promise<unknown> = Promise.resolve();
  const locks: LocksLike = {
    request<T>(name: string, callback: () => T | Promise<T>): Promise<T> {
      names.push(name);
      const run = held.then(callback);
      held = run.catch(() => undefined);
      return run;
    },
  };
  return { locks, names };
}

function onlineEvents() {
  const listeners = new Set<() => void>();
  const source: OnlineEventSource = {
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
  };
  return {
    source,
    get listening() {
      return listeners.size;
    },
    fire() {
      for (const listener of [...listeners]) listener();
    },
  };
}

/** BroadcastChannel semantics in memory, for two tabs. */
function createHub() {
  const members = new Set<Set<(event: { data: unknown }) => void>>();
  return (): ChannelLike => {
    const mine = new Set<(event: { data: unknown }) => void>();
    members.add(mine);
    return {
      postMessage(message) {
        for (const other of members) {
          if (other !== mine)
            for (const listen of other) listen({ data: message });
        }
      },
      addEventListener: (_type, listener) => mine.add(listener),
      removeEventListener: (_type, listener) => mine.delete(listener),
      close: () => members.delete(mine),
    };
  };
}

const silent: IdentityChannel | null = null;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const loaded: ManagedIdentity[] = [];
afterEach(() => {
  for (const identity of loaded.splice(0)) identity.dispose();
});

async function load(
  options: Parameters<typeof loadIdentity>[0],
): Promise<ManagedIdentity> {
  const identity = await loadIdentity({
    now: () => NOW,
    locks: null,
    online: null,
    channel: silent,
    ...options,
  });
  loaded.push(identity);
  return identity;
}

function stored(storage: ReturnType<typeof createMemoryStorage>): unknown {
  return JSON.parse(storage.getItem(IDENTITY_KEY) ?? "null");
}

const registered = (cookieSavedAt: number | null): LocalIdentity => ({
  ...mintIdentity(NOW - 30 * DAY),
  registered: true,
  cookieSavedAt: cookieSavedAt as EpochMs | null,
});

describe("restore precedence (§9.6)", () => {
  it("uses the stored identity and never asks the cookie", async () => {
    const existing = registered(NOW - DAY);
    const storage = createMemoryStorage({
      [IDENTITY_KEY]: JSON.stringify(existing),
    });
    const fake = fakeBackup({ kind: "none" });
    const onRestored = vi.fn();
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
      onRestored,
    });
    expect(identity.current()).toEqual(existing);
    expect(fake.restores).toBe(0);
    expect(onRestored).not.toHaveBeenCalled();
    // Saved a day ago: no refresh yet.
    await settle();
    expect(fake.saved).toEqual([]);
  });

  it("refreshes a stored identity's cookie when it is 7 days old", async () => {
    const existing = registered(NOW - 7 * DAY);
    const storage = createMemoryStorage({
      [IDENTITY_KEY]: JSON.stringify(existing),
    });
    const fake = fakeBackup();
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
    });
    await settle();
    expect(fake.saved).toEqual([
      { playerId: existing.playerId, secret: existing.secret },
    ]);
    expect(identity.current().cookieSavedAt).toBe(NOW);
    expect(fake.restores).toBe(0);
  });

  it("never refreshes the cookie of an identity the server hasn't seen", async () => {
    const storage = createMemoryStorage({
      [IDENTITY_KEY]: JSON.stringify(mintIdentity(NOW - 30 * DAY)),
    });
    const fake = fakeBackup();
    await load({ kv: createKv({ storage }), backup: fake.backup });
    await settle();
    expect(fake.saved).toEqual([]);
  });

  it("restores silently from the cookie when the store is empty, and says so once", async () => {
    const cookie = registered(null);
    const credential = { playerId: cookie.playerId, secret: cookie.secret };
    const storage = createMemoryStorage();
    const fake = fakeBackup({ kind: "restored", credential });
    const onRestored = vi.fn();
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
      onRestored,
    });
    expect(identity.current()).toMatchObject({
      playerId: cookie.playerId,
      secret: cookie.secret,
      registered: true,
      source: "cookie",
      createdAt: NOW,
    });
    expect(identity.stored).toBe(true);
    expect(stored(storage)).toMatchObject({ playerId: cookie.playerId });
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(onRestored).toHaveBeenCalledWith("cookie");
    // The cookie's age is unknown, so it is posted again at once.
    await settle();
    expect(fake.saved).toEqual([credential]);
    expect(identity.current().cookieSavedAt).toBe(NOW);
  });

  it("mints and stores a new identity when there is no cookie", async () => {
    const storage = createMemoryStorage();
    const fake = fakeBackup({ kind: "none" });
    const onRestored = vi.fn();
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
      onRestored,
    });
    expect(identity.current()).toMatchObject({
      registered: false,
      source: "minted",
      cookieSavedAt: null,
    });
    expect(identity.stored).toBe(true);
    expect(stored(storage)).toEqual(identity.current());
    expect(fake.restores).toBe(1);
    expect(onRestored).not.toHaveBeenCalled();
    await settle();
    expect(fake.saved).toEqual([]);
  });

  it("mints and stores when the route refuses the browser (no Sec-Fetch-Site)", async () => {
    const storage = createMemoryStorage();
    const identity = await load({
      kv: createKv({ storage }),
      backup: fakeBackup({ kind: "refused" }).backup,
    });
    expect(identity.stored).toBe(true);
    expect(stored(storage)).toEqual(identity.current());
  });

  it("asks the cookie before minting when the stored identity is unreadable", async () => {
    const cookie = registered(null);
    const storage = createMemoryStorage({ [IDENTITY_KEY]: "{broken" });
    const identity = await load({
      kv: createKv({ storage }),
      backup: fakeBackup({
        kind: "restored",
        credential: { playerId: cookie.playerId, secret: cookie.secret },
      }).backup,
    });
    expect(identity.current().playerId).toBe(cookie.playerId);
    expect(storage.getItem("qz:quarantine:identity")).toBe("{broken");
  });
});

describe("a restore without an answer (offline, a timeout, a server error)", () => {
  it("keeps the new identity in memory, so a later answer can still restore", async () => {
    const storage = createMemoryStorage();
    const cookie = registered(null);
    const online = onlineEvents();
    const fake = fakeBackup(
      { kind: "failed" },
      {
        kind: "restored",
        credential: { playerId: cookie.playerId, secret: cookie.secret },
      },
    );
    const onRestored = vi.fn();
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
      online: online.source,
      onRestored,
    });
    expect(identity.stored).toBe(false);
    expect(identity.current().source).toBe("minted");
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(online.listening).toBe(1);

    online.fire();
    await settle();
    expect(identity.current()).toMatchObject({
      playerId: cookie.playerId,
      source: "cookie",
      registered: true,
    });
    expect(identity.stored).toBe(true);
    expect(onRestored).toHaveBeenCalledWith("cookie");
    expect(online.listening).toBe(0);
  });

  it("stores the new identity once the answer is no cookie", async () => {
    const storage = createMemoryStorage();
    const online = onlineEvents();
    const identity = await load({
      kv: createKv({ storage }),
      backup: fakeBackup({ kind: "failed" }, { kind: "none" }).backup,
      online: online.source,
    });
    const minted = identity.current();
    online.fire();
    await settle();
    expect(identity.current()).toEqual(minted);
    expect(stored(storage)).toEqual(minted);
    expect(online.listening).toBe(0);
  });

  it("keeps waiting while the restore still fails", async () => {
    const storage = createMemoryStorage();
    const online = onlineEvents();
    const fake = fakeBackup({ kind: "failed" });
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
      online: online.source,
    });
    online.fire();
    await settle();
    expect(fake.restores).toBe(2);
    expect(identity.stored).toBe(false);
    expect(online.listening).toBe(1);
  });

  it("lets registration settle it: the identity the server knows is stored and kept", async () => {
    const storage = createMemoryStorage();
    const online = onlineEvents();
    const cookie = registered(null);
    const fake = fakeBackup(
      { kind: "failed" },
      {
        kind: "restored",
        credential: { playerId: cookie.playerId, secret: cookie.secret },
      },
    );
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
      online: online.source,
    });
    const minted = identity.current();
    identity.markRegistered();
    expect(identity.stored).toBe(true);
    online.fire();
    await settle();
    expect(identity.current().playerId).toBe(minted.playerId);
    expect(fake.restores).toBe(1);
  });

  it("takes the identity another tab stored meanwhile", async () => {
    const storage = createMemoryStorage();
    const online = onlineEvents();
    const fake = fakeBackup({ kind: "failed" });
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
      online: online.source,
    });
    const other = mintIdentity(NOW);
    storage.setItem(IDENTITY_KEY, JSON.stringify(other));
    online.fire();
    await settle();
    expect(identity.current()).toEqual(other);
    expect(fake.restores).toBe(1);
  });
});

describe("tabs and locks", () => {
  it("settles under the qz-identity Web Lock, so tabs opened together share one identity", async () => {
    const storage = createMemoryStorage();
    const { locks, names } = fakeLocks();
    const fake = fakeBackup({ kind: "none" });
    const [a, b] = await Promise.all([
      load({ kv: createKv({ storage }), backup: fake.backup, locks }),
      load({ kv: createKv({ storage }), backup: fake.backup, locks }),
    ]);
    expect(names).toEqual([IDENTITY_LOCK, IDENTITY_LOCK]);
    expect(b.current().playerId).toBe(a.current().playerId);
    expect(fake.restores).toBe(1);
  });

  it("still loads when the lock manager refuses", async () => {
    const locks: LocksLike = {
      request: () =>
        Promise.reject(new DOMException("denied", "SecurityError")),
    };
    const identity = await load({
      kv: createKv(),
      backup: fakeBackup({ kind: "none" }).backup,
      locks,
    });
    expect(identity.current().source).toBe("minted");
  });

  it("follows another tab's change through the channel", async () => {
    const storage = createMemoryStorage();
    const join = createHub();
    const channel = (kv: ReturnType<typeof createKv>) =>
      createIdentityChannel({
        device: kv.device,
        channel: join(),
        storageEvents: null,
      });
    const kvA = createKv({ storage });
    const kvB = createKv({ storage });
    const a = await load({
      kv: kvA,
      backup: fakeBackup({ kind: "none" }).backup,
      channel: channel(kvA),
    });
    const b = await load({
      kv: kvB,
      backup: fakeBackup({ kind: "none" }).backup,
      channel: channel(kvB),
    });
    expect(b.current()).toEqual(a.current());
    const heard: LocalIdentity[] = [];
    b.subscribe((next) => heard.push(next));

    const restored: LocalIdentity = {
      ...mintIdentity(NOW),
      registered: true,
      source: "sync",
    };
    a.replace(restored);
    expect(b.current().playerId).toBe(restored.playerId);
    expect(heard.map((next) => next.playerId)).toEqual([restored.playerId]);
  });

  it("never touches the cookie in a device namespace (mock builds, §6.1)", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("no network")));
    vi.stubGlobal("fetch", fetchSpy);
    const storage = createMemoryStorage();
    const identity = await load({
      kv: createKv({ storage, device: "phone-3" }),
      // No backup option: the default for a device namespace is none.
    });
    identity.markRegistered();
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(identity.stored).toBe(true);
    expect(storage.getItem("qz:d:phone-3:identity")).not.toBeNull();
  });

  it("rejects when no identity can be minted (§9.1 step 5), closing the channel it opened", async () => {
    const closed: string[] = [];
    class FakeChannel {
      constructor(readonly name: string) {}
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
      close() {
        closed.push(this.name);
      }
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    await expect(
      loadIdentity({
        kv: createKv(),
        backup: fakeBackup({ kind: "none" }).backup,
        locks: null,
        online: null,
        random: () => {
          throw new Error("crypto.getRandomValues is missing");
        },
      }),
    ).rejects.toThrow();
    expect(closed).toEqual(["qz"]);
  });

  it("hears a change another tab made while it was settling", async () => {
    const storage = createMemoryStorage();
    const other = mintIdentity(NOW);
    const backup: BackupTransport = {
      restore() {
        // Another tab stores its identity while this one asks the cookie.
        storage.setItem(IDENTITY_KEY, JSON.stringify(other));
        return Promise.resolve({ kind: "failed" });
      },
      save: () => Promise.resolve(true),
      remove: () => Promise.resolve(true),
    };
    const identity = await load({ kv: createKv({ storage }), backup });
    expect(identity.current()).toEqual(other);
    expect(identity.stored).toBe(true);
  });
});

describe("recovery after auth_failed (§9.6)", () => {
  it("takes the cookie's identity when it differs from the one that failed", async () => {
    const storage = createMemoryStorage({
      [IDENTITY_KEY]: JSON.stringify(registered(NOW)),
    });
    const cookie = registered(null);
    const credential = { playerId: cookie.playerId, secret: cookie.secret };
    const fake = fakeBackup({ kind: "restored", credential });
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
    });
    await expect(identity.recover()).resolves.toBe("restored");
    expect(identity.current()).toMatchObject({
      ...credential,
      source: "cookie",
    });
    expect(stored(storage)).toMatchObject(credential);
  });

  it("starts a new identity when the cookie holds the one that failed", async () => {
    const failing = registered(NOW);
    const storage = createMemoryStorage({
      [IDENTITY_KEY]: JSON.stringify(failing),
    });
    const fake = fakeBackup({
      kind: "restored",
      credential: { playerId: failing.playerId, secret: failing.secret },
    });
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
    });
    await expect(identity.recover()).resolves.toBe("minted");
    expect(identity.current().playerId).not.toBe(failing.playerId);
    expect(identity.current()).toMatchObject({
      registered: false,
      source: "minted",
    });
    expect(stored(storage)).toEqual(identity.current());
    // Unregistered: the old cookie stays until the new identity registers.
    await settle();
    expect(fake.saved).toEqual([]);
  });

  it("starts a new identity when there is no cookie, or no backup at all", async () => {
    const withNone = await load({
      kv: createKv(),
      backup: fakeBackup({ kind: "none" }).backup,
    });
    const before = withNone.current().playerId;
    await expect(withNone.recover()).resolves.toBe("minted");
    expect(withNone.current().playerId).not.toBe(before);

    const withoutBackup = await load({ kv: createKv(), backup: null });
    await expect(withoutBackup.recover()).resolves.toBe("minted");
  });
});
