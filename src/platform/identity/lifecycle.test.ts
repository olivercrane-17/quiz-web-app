import { afterEach, describe, expect, it, vi } from "vitest";

import type { EpochMs, LocalIdentity } from "@/engine/types";
import { createKv, createMemoryStorage } from "@/platform/storage";

import type {
  BackupSaveOutcome,
  BackupTransport,
  RestoreOutcome,
} from "./backup";
import {
  createIdentityChannel,
  type ChannelLike,
  type IdentityChannel,
} from "./broadcast";
import type { BackupCredential } from "./cookie";
import {
  RESTORE_RETRY_EVERY_MS,
  RESTORE_RETRY_MS,
  loadIdentity,
  type LocksLike,
  type ManagedIdentity,
  type OnlineEventSource,
  type TimersLike,
  type VisibilityEventSource,
} from "./lifecycle";
import {
  IDENTITY_KEY,
  IDENTITY_LOCK,
  UNDER13_KEY,
  identityFromBackup,
  mintIdentity,
} from "./local";

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
      return Promise.resolve("saved");
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

/**
 * The browser's cookie jar behind the routes: `restore()` answers what the
 * jar holds, unless the next answers were set to fail; `save()` and
 * `remove()` change it.
 */
function cookieJar(initial: BackupCredential | null = null) {
  let value = initial;
  let failNext = 0;
  const saved: BackupCredential[] = [];
  let restores = 0;
  let removes = 0;
  const backup: BackupTransport = {
    restore(): Promise<RestoreOutcome> {
      restores += 1;
      if (failNext > 0) {
        failNext -= 1;
        return Promise.resolve({ kind: "failed" });
      }
      return Promise.resolve(
        value === null
          ? { kind: "none" }
          : { kind: "restored", credential: { ...value } },
      );
    },
    save(credential): Promise<BackupSaveOutcome> {
      saved.push(credential);
      value = { ...credential };
      return Promise.resolve("saved");
    },
    remove() {
      removes += 1;
      value = null;
      return Promise.resolve(true);
    },
  };
  return {
    backup,
    saved,
    get value() {
      return value;
    },
    get restores() {
      return restores;
    },
    get removes() {
      return removes;
    },
    /** The next `count` restores get no answer (a timeout, a 5xx). */
    fail(count: number) {
      failNext = count;
    },
    /** What another browser session left in the jar. */
    put(credential: BackupCredential | null) {
      value = credential === null ? null : { ...credential };
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

function visibilityEvents() {
  const listeners = new Set<() => void>();
  const source: VisibilityEventSource & { visibilityState: string } = {
    visibilityState: "hidden",
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
    show() {
      source.visibilityState = "visible";
      for (const listener of [...listeners]) listener();
    },
    hide() {
      source.visibilityState = "hidden";
      for (const listener of [...listeners]) listener();
    },
  };
}

/** The global timers, as the fake ones vitest installs see them. */
const globalTimers: TimersLike = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

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
  vi.useRealTimers();
});

async function load(
  options: Parameters<typeof loadIdentity>[0],
): Promise<ManagedIdentity> {
  const identity = await loadIdentity({
    now: () => NOW,
    locks: null,
    online: null,
    visibility: null,
    timers: null,
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

const credentialOf = (identity: LocalIdentity): BackupCredential => ({
  playerId: identity.playerId,
  secret: identity.secret,
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
    expect(fake.saved).toEqual([credentialOf(existing)]);
    expect(identity.current().cookieSavedAt).toBe(NOW);
    // Posted before: its refresh never asks the cookie first.
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
    expect(fake.restores).toBe(0);
  });

  it("restores silently from the cookie when the store is empty, and says so once", async () => {
    const cookie = registered(null);
    const credential = credentialOf(cookie);
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
      backup: fakeBackup({ kind: "restored", credential: credentialOf(cookie) })
        .backup,
    });
    expect(identity.current().playerId).toBe(cookie.playerId);
    expect(storage.getItem("qz:quarantine:identity")).toBe("{broken");
  });

  it("registers a new identity and posts it at once when the cookie answered empty at load", async () => {
    const jar = cookieJar();
    const identity = await load({ kv: createKv(), backup: jar.backup });
    identity.markRegistered();
    await settle();
    const minted = identity.current();
    expect(jar.saved).toEqual([credentialOf(minted)]);
    expect(jar.value).toEqual(credentialOf(minted));
    // The answer at load cleared it: no second question.
    expect(jar.restores).toBe(1);
    expect(minted.cookieSavedAt).toBe(NOW);
  });
});

describe("storage that never persists (in-app browsers without DOM storage)", () => {
  it("restores from the cookie on every load but never reports a lost store", async () => {
    const cookie = registered(NOW);
    const jar = cookieJar(credentialOf(cookie));
    const onRestored = vi.fn();
    for (let load_ = 0; load_ < 3; load_ += 1) {
      const identity = await load({
        kv: createKv({ storage: null }),
        backup: jar.backup,
        onRestored,
      });
      expect(identity.current().playerId).toBe(cookie.playerId);
    }
    expect(jar.restores).toBe(3);
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("never reports one from a later answer either", async () => {
    const cookie = registered(NOW);
    const jar = cookieJar(credentialOf(cookie));
    jar.fail(1);
    const online = onlineEvents();
    const onRestored = vi.fn();
    const identity = await load({
      kv: createKv({ storage: null }),
      backup: jar.backup,
      online: online.source,
      onRestored,
    });
    online.fire();
    await settle();
    expect(identity.current().playerId).toBe(cookie.playerId);
    expect(onRestored).not.toHaveBeenCalled();
  });
});

describe("a restore without an answer (offline, a timeout, a server error)", () => {
  it("keeps the new identity in memory, so a later answer can still restore", async () => {
    const storage = createMemoryStorage();
    const cookie = registered(null);
    const online = onlineEvents();
    const fake = fakeBackup(
      { kind: "failed" },
      { kind: "restored", credential: credentialOf(cookie) },
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

  it("asks again after 5 s, 15 s and 60 s, then every 5 minutes, even if the browser never went offline", async () => {
    vi.useFakeTimers();
    const cookie = registered(null);
    const jar = cookieJar(credentialOf(cookie));
    jar.fail(6);
    const identity = await load({
      kv: createKv({ storage: createMemoryStorage() }),
      backup: jar.backup,
      timers: globalTimers,
    });
    expect(RESTORE_RETRY_MS).toEqual([5_000, 15_000, 60_000]);
    expect(RESTORE_RETRY_EVERY_MS).toBe(300_000);
    expect(jar.restores).toBe(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(jar.restores).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(jar.restores).toBe(2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(jar.restores).toBe(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(jar.restores).toBe(4);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(jar.restores).toBe(5);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(jar.restores).toBe(6);
    expect(identity.stored).toBe(false);
    // The seventh question is answered: the cookie's identity comes back.
    await vi.advanceTimersByTimeAsync(300_000);
    expect(jar.restores).toBe(7);
    expect(identity.current().playerId).toBe(cookie.playerId);
    // Settled: no more questions.
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(jar.restores).toBe(7);
  });

  it("asks again when the page becomes visible", async () => {
    const cookie = registered(null);
    const jar = cookieJar(credentialOf(cookie));
    jar.fail(1);
    const visibility = visibilityEvents();
    const identity = await load({
      kv: createKv({ storage: createMemoryStorage() }),
      backup: jar.backup,
      visibility: visibility.source,
    });
    expect(visibility.listening).toBe(1);
    visibility.hide();
    await settle();
    expect(jar.restores).toBe(1);
    visibility.show();
    await settle();
    expect(jar.restores).toBe(2);
    expect(identity.current().playerId).toBe(cookie.playerId);
    expect(visibility.listening).toBe(0);
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

describe("the cookie is never overwritten unread (§9.6)", () => {
  it("an in-memory identity that registers never posts over a cookie the device has not read", async () => {
    // The wiped store's identity A is in the cookie; /api/restore keeps
    // failing, so the tab plays as B.
    const a = registered(NOW - DAY);
    const jar = cookieJar(credentialOf(a));
    jar.fail(2);
    const storage = createMemoryStorage();
    const online = onlineEvents();
    const onRestored = vi.fn();
    const identity = await load({
      kv: createKv({ storage }),
      backup: jar.backup,
      online: online.source,
      onRestored,
    });
    const b = identity.current();
    identity.markRegistered();
    await settle();
    // Asked again before posting; still no answer: B is stored (a reload
    // keeps its progress) but never posted.
    expect(jar.restores).toBe(2);
    expect(jar.saved).toEqual([]);
    expect(jar.value).toEqual(credentialOf(a));
    expect(stored(storage)).toMatchObject({
      playerId: b.playerId,
      registered: true,
      cookieSavedAt: null,
    });
    // Still asking, though B is stored now.
    expect(online.listening).toBe(1);

    // The cookie answers: it holds A, the player's identity, which comes back.
    online.fire();
    await settle();
    expect(identity.current()).toMatchObject({
      playerId: a.playerId,
      source: "cookie",
    });
    expect(stored(storage)).toMatchObject({ playerId: a.playerId });
    expect(onRestored).toHaveBeenCalledTimes(1);
    // Only A was ever posted, never B.
    expect(jar.saved).toEqual([credentialOf(a)]);
    expect(jar.value).toEqual(credentialOf(a));
    expect(online.listening).toBe(0);
  });

  it("switches to the cookie's identity when it answers at registration: subscribers restart, nothing of B is posted", async () => {
    const a = registered(NOW - DAY);
    const jar = cookieJar(credentialOf(a));
    jar.fail(1);
    const storage = createMemoryStorage();
    const onRestored = vi.fn();
    const identity = await load({
      kv: createKv({ storage }),
      backup: jar.backup,
      onRestored,
    });
    const heard: string[] = [];
    identity.subscribe((next) => heard.push(next.playerId));
    identity.markRegistered();
    await settle();
    expect(identity.current().playerId).toBe(a.playerId);
    expect(heard).toEqual([a.playerId]);
    expect(stored(storage)).toMatchObject({ playerId: a.playerId });
    expect(jar.saved).toEqual([credentialOf(a)]);
    expect(onRestored).toHaveBeenCalledWith("cookie");
  });

  it("posts the registered identity once the cookie turns out empty", async () => {
    const jar = cookieJar();
    jar.fail(1);
    const storage = createMemoryStorage();
    const identity = await load({
      kv: createKv({ storage }),
      backup: jar.backup,
    });
    const b = identity.current();
    identity.markRegistered();
    await settle();
    expect(identity.stored).toBe(true);
    expect(stored(storage)).toMatchObject({
      playerId: b.playerId,
      registered: true,
      cookieSavedAt: NOW,
    });
    expect(jar.saved).toEqual([credentialOf(b)]);
    expect(jar.restores).toBe(2);
  });

  it("an identity from an earlier visit asks the cookie before its first post, and never overwrites another there", async () => {
    // B was registered on an earlier visit while the cookie had no answer,
    // and never posted. The cookie holds A. There is no telling which is
    // the player's: neither is touched.
    const a = registered(NOW - DAY);
    const b: LocalIdentity = { ...mintIdentity(NOW - DAY), registered: true };
    const jar = cookieJar(credentialOf(a));
    const storage = createMemoryStorage({ [IDENTITY_KEY]: JSON.stringify(b) });
    const identity = await load({
      kv: createKv({ storage }),
      backup: jar.backup,
    });
    await settle();
    expect(jar.restores).toBe(1);
    expect(jar.saved).toEqual([]);
    expect(jar.value).toEqual(credentialOf(a));
    expect(identity.current()).toEqual(b);
    expect(stored(storage)).toEqual(b);
  });

  it("an identity from an earlier visit is posted once the cookie answers empty, or already holds it", async () => {
    const b: LocalIdentity = { ...mintIdentity(NOW - DAY), registered: true };
    const empty = cookieJar();
    const first = await load({
      kv: createKv({
        storage: createMemoryStorage({ [IDENTITY_KEY]: JSON.stringify(b) }),
      }),
      backup: empty.backup,
    });
    await settle();
    expect(empty.saved).toEqual([credentialOf(b)]);
    expect(first.current().cookieSavedAt).toBe(NOW);

    const holding = cookieJar(credentialOf(b));
    await load({
      kv: createKv({
        storage: createMemoryStorage({ [IDENTITY_KEY]: JSON.stringify(b) }),
      }),
      backup: holding.backup,
    });
    await settle();
    expect(holding.saved).toEqual([credentialOf(b)]);
  });

  it("an earlier visit's identity whose question still fails is asked again in this tab", async () => {
    const b: LocalIdentity = { ...mintIdentity(NOW - DAY), registered: true };
    const jar = cookieJar();
    jar.fail(1);
    const online = onlineEvents();
    await load({
      kv: createKv({
        storage: createMemoryStorage({ [IDENTITY_KEY]: JSON.stringify(b) }),
      }),
      backup: jar.backup,
      online: online.source,
    });
    await settle();
    expect(jar.saved).toEqual([]);
    expect(online.listening).toBe(1);
    online.fire();
    await settle();
    expect(jar.saved).toEqual([credentialOf(b)]);
    expect(online.listening).toBe(0);
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
      readonly name: string;
      constructor(name: string) {
        this.name = name;
      }
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
        visibility: null,
        timers: null,
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
      save: () => Promise.resolve("saved"),
      remove: () => Promise.resolve(true),
    };
    const identity = await load({ kv: createKv({ storage }), backup });
    expect(identity.current()).toEqual(other);
    expect(identity.stored).toBe(true);
  });
});

/** Two tabs over one storage, one broadcast hub and one lock manager. */
async function twoTabs(backup: BackupTransport) {
  const storage = createMemoryStorage();
  const join = createHub();
  const { locks } = fakeLocks();
  const tab = async () => {
    const kv = createKv({ storage });
    return load({
      kv,
      backup,
      locks,
      channel: createIdentityChannel({
        device: kv.device,
        channel: join(),
        storageEvents: null,
      }),
    });
  };
  const first = await tab();
  const second = await tab();
  return { storage, first, second };
}

describe("recovery after auth_failed (§9.6)", () => {
  it("takes the cookie's identity when it differs from the one that failed", async () => {
    const failing = registered(NOW);
    const storage = createMemoryStorage({
      [IDENTITY_KEY]: JSON.stringify(failing),
    });
    const cookie = registered(null);
    const credential = credentialOf(cookie);
    const fake = fakeBackup({ kind: "restored", credential });
    const identity = await load({
      kv: createKv({ storage }),
      backup: fake.backup,
    });
    await expect(identity.recover(failing)).resolves.toBe("restored");
    expect(identity.current()).toMatchObject({
      ...credential,
      source: "cookie",
    });
    expect(stored(storage)).toMatchObject(credential);
  });

  it("starts a new identity when the cookie holds the one that failed, and lets it overwrite that cookie at once", async () => {
    const failing = registered(NOW);
    const storage = createMemoryStorage({
      [IDENTITY_KEY]: JSON.stringify(failing),
    });
    const jar = cookieJar(credentialOf(failing));
    const identity = await load({
      kv: createKv({ storage }),
      backup: jar.backup,
    });
    await expect(identity.recover(failing)).resolves.toBe("minted");
    const fresh = identity.current();
    expect(fresh.playerId).not.toBe(failing.playerId);
    expect(fresh).toMatchObject({ registered: false, source: "minted" });
    expect(stored(storage)).toEqual(fresh);
    // Unregistered: the old cookie stays until the new identity registers.
    await settle();
    expect(jar.saved).toEqual([]);
    expect(jar.restores).toBe(1);
    // Then the dead credential's cookie gives way, with no second question.
    identity.markRegistered();
    await settle();
    expect(jar.value).toEqual(credentialOf(fresh));
    expect(jar.restores).toBe(1);
  });

  it("starts a new identity when there is no cookie, or no backup at all", async () => {
    const withNone = await load({
      kv: createKv(),
      backup: fakeBackup({ kind: "none" }).backup,
    });
    const before = withNone.current();
    await expect(withNone.recover(before)).resolves.toBe("minted");
    expect(withNone.current().playerId).not.toBe(before.playerId);

    const withoutBackup = await load({ kv: createKv(), backup: null });
    await expect(withoutBackup.recover(withoutBackup.current())).resolves.toBe(
      "minted",
    );
  });

  it("asks nothing when the tab has moved on from the credential that failed", async () => {
    const jar = cookieJar();
    const identity = await load({ kv: createKv(), backup: jar.backup });
    const now_ = identity.current();
    const old = mintIdentity(NOW);
    await expect(identity.recover(old)).resolves.toBe("restored");
    expect(identity.current()).toEqual(now_);
    expect(jar.restores).toBe(1); // the load's only
  });

  it("back to back: a late auth_failed for the old credential keeps the identity the first recovery restored", async () => {
    const failing = registered(NOW);
    const cookie = registered(null);
    const jar = cookieJar(credentialOf(cookie));
    const identity = await load({
      kv: createKv({
        storage: createMemoryStorage({
          [IDENTITY_KEY]: JSON.stringify(failing),
        }),
      }),
      backup: jar.backup,
    });
    await expect(identity.recover(failing)).resolves.toBe("restored");
    // replace() re-posted C, so the cookie and the tab now agree on C.
    await settle();
    expect(jar.value).toEqual(credentialOf(cookie));
    // A write sent with the old credential fails too: C stays.
    await expect(identity.recover(failing)).resolves.toBe("restored");
    expect(identity.current().playerId).toBe(cookie.playerId);
    expect(identity.current().registered).toBe(true);
  });

  it("two recoveries at once in one tab mint once", async () => {
    const failing = registered(NOW);
    const jar = cookieJar(credentialOf(failing));
    const identity = await load({
      kv: createKv({
        storage: createMemoryStorage({
          [IDENTITY_KEY]: JSON.stringify(failing),
        }),
      }),
      backup: jar.backup,
    });
    const heard: string[] = [];
    identity.subscribe((next) => heard.push(next.playerId));
    const outcomes = await Promise.all([
      identity.recover(failing),
      identity.recover(failing),
    ]);
    expect(outcomes).toEqual(["minted", "restored"]);
    expect(heard).toEqual([identity.current().playerId]);
    expect(jar.restores).toBe(1);
  });

  it("two tabs recovering at once mint once, and both end on that identity", async () => {
    const failing = registered(NOW);
    const jar = cookieJar(credentialOf(failing));
    const { storage, first, second } = await twoTabs(jar.backup);
    first.replace(failing);
    expect(second.current()).toEqual(failing);
    const heardFirst: string[] = [];
    const heardSecond: string[] = [];
    first.subscribe((next) => heardFirst.push(next.playerId));
    second.subscribe((next) => heardSecond.push(next.playerId));
    const outcomes = await Promise.all([
      first.recover(failing),
      second.recover(failing),
    ]);
    expect([...outcomes].sort()).toEqual(["minted", "restored"]);
    const fresh = first.current();
    expect(second.current()).toEqual(fresh);
    expect(stored(storage)).toEqual(fresh);
    expect(heardFirst).toEqual([fresh.playerId]);
    expect(heardSecond).toEqual([fresh.playerId]);
  });

  it("two tabs: the second tab's late recovery keeps the identity the first one restored", async () => {
    const failing = registered(NOW);
    const cookie = registered(null);
    const jar = cookieJar(credentialOf(cookie));
    const { first, second } = await twoTabs(jar.backup);
    first.replace(failing);
    await settle();
    // The cookie holds another identity than the one about to fail.
    jar.put(credentialOf(cookie));
    await expect(first.recover(failing)).resolves.toBe("restored");
    expect(second.current().playerId).toBe(cookie.playerId);
    await expect(second.recover(failing)).resolves.toBe("restored");
    expect(first.current().playerId).toBe(cookie.playerId);
    expect(second.current().playerId).toBe(cookie.playerId);
  });

  it("a recovery without an answer mints, and the new identity reads the cookie before its first post", async () => {
    const failing = registered(NOW);
    const other = registered(null);
    const jar = cookieJar(credentialOf(other));
    jar.fail(1);
    const identity = await load({
      kv: createKv({
        storage: createMemoryStorage({
          [IDENTITY_KEY]: JSON.stringify(failing),
        }),
      }),
      backup: jar.backup,
    });
    await expect(identity.recover(failing)).resolves.toBe("minted");
    identity.markRegistered();
    await settle();
    // The cookie held another identity than the one that failed: it is the
    // player's, as the recovery would have found had it been answered.
    expect(identity.current().playerId).toBe(other.playerId);
    expect(jar.saved).toEqual([credentialOf(other)]);
  });
});

describe("forgetting the identity (Delete my data, Under 13, §9.7)", () => {
  it("forget() expires the cookie and removes the identity, and other tabs stop writing it back", async () => {
    const jar = cookieJar();
    const { storage, first, second } = await twoTabs(jar.backup);
    first.markRegistered();
    await settle();
    expect(jar.value).not.toBeNull();
    const old = first.current();

    await expect(first.forget()).resolves.toBe(true);
    expect(jar.value).toBeNull();
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(first.forgotten).toBe(true);
    expect(second.forgotten).toBe(true);
    expect(second.current().playerId).not.toBe(old.playerId);

    // The other tab's next write registers nothing of the old identity.
    second.markRegistered();
    await second.refreshBackup();
    await settle();
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(jar.value).toBeNull();
    expect(jar.saved).toHaveLength(1);
  });

  it("forget() waits for this tab's post in flight before it expires the cookie", async () => {
    const order: string[] = [];
    let land: () => void = () => {};
    const backup: BackupTransport = {
      restore: () => Promise.resolve({ kind: "none" }),
      save: () =>
        new Promise((resolve) => {
          land = () => {
            order.push("post landed");
            resolve("saved");
          };
        }),
      remove: () => {
        order.push("expired");
        return Promise.resolve(true);
      },
    };
    const storage = createMemoryStorage();
    const identity = await load({ kv: createKv({ storage }), backup });
    identity.markRegistered();
    // The post is on its way.
    await settle();
    const forgotten = identity.forget();
    await settle();
    expect(order).toEqual([]);
    land();
    await expect(forgotten).resolves.toBe(true);
    expect(order).toEqual(["post landed", "expired"]);
    // The stamp never wrote the forgotten identity back.
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
  });

  it("says when the cookie couldn't be expired, so the caller can try again", async () => {
    const identity = await load({
      kv: createKv(),
      backup: {
        restore: () => Promise.resolve({ kind: "none" }),
        save: () => Promise.resolve("saved"),
        remove: () => Promise.resolve(false),
      },
    });
    await expect(identity.forget()).resolves.toBe(false);
    expect(identity.forgotten).toBe(true);
  });

  it("with the Under 13 flag, a load never reads, stores or posts an identity, and forget() still expires the cookie", async () => {
    const child = registered(NOW);
    const jar = cookieJar(credentialOf(child));
    const storage = createMemoryStorage({
      [UNDER13_KEY]: JSON.stringify({ since: NOW }),
      // Left behind by a tab from before the flag: never used again.
      [IDENTITY_KEY]: JSON.stringify(child),
    });
    const onRestored = vi.fn();
    const identity = await load({
      kv: createKv({ storage }),
      backup: jar.backup,
      onRestored,
    });
    expect(identity.forgotten).toBe(true);
    expect(identity.stored).toBe(false);
    expect(identity.current().playerId).not.toBe(child.playerId);
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    identity.markRegistered();
    identity.replace(identityFromBackup(credentialOf(child), NOW));
    await identity.refreshBackup();
    await settle();
    expect(jar.restores).toBe(0);
    expect(jar.saved).toEqual([]);
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(onRestored).not.toHaveBeenCalled();

    // An expiry that failed while offline is retried through forget().
    await expect(identity.forget()).resolves.toBe(true);
    expect(jar.removes).toBe(1);
    expect(jar.value).toBeNull();
  });

  it("a tab that sees the Under 13 flag appear forgets the identity", async () => {
    const jar = cookieJar();
    const { storage, first, second } = await twoTabs(jar.backup);
    // SET-1 in another context: keys cleared, then the flag.
    storage.removeItem(IDENTITY_KEY);
    storage.setItem(UNDER13_KEY, JSON.stringify({ since: NOW }));
    first.reload();
    expect(first.forgotten).toBe(true);
    second.markRegistered();
    await settle();
    expect(second.forgotten).toBe(true);
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(jar.saved).toEqual([]);
  });
});
