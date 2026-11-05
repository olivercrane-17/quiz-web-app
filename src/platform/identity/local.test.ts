import { describe, expect, it } from "vitest";

import {
  parsePlayerId,
  parseSecret,
  type EpochMs,
  type LocalIdentity,
} from "@/engine/types";
import { createKv, createMemoryStorage } from "@/platform/storage";

import type { BackupSaveOutcome, BackupTransport } from "./backup";
import type { IdentityChannel } from "./broadcast";
import { BACKUP_REFRESH_MS, type BackupCredential } from "./cookie";
import {
  IDENTITY_KEY,
  UNDER13_KEY,
  backupDue,
  base64url,
  createLocalIdentityProvider,
  decodeLocalIdentity,
  firstBackupPending,
  identityFromBackup,
  mintIdentity,
  uuidV4,
} from "./local";
import { PROFILE_KEY } from "./profile";

const NOW = Date.UTC(2026, 10, 1, 9);
const DAY = 24 * 60 * 60 * 1000;

function counting(start = 0): (bytes: Uint8Array) => void {
  let next = start;
  return (bytes) => {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = next & 0xff;
      next += 1;
    }
  };
}

/** A backup that records what it was sent and answers `answer` (a promise the test settles, when held). */
function recordingBackup(answer: BackupSaveOutcome | "hold" = "saved") {
  const saved: BackupCredential[] = [];
  const pending: ((outcome: BackupSaveOutcome) => void)[] = [];
  const backup: BackupTransport = {
    restore: () => Promise.resolve({ kind: "none" }),
    save(credential) {
      saved.push(credential);
      if (answer === "hold") {
        return new Promise((resolve) => pending.push(resolve));
      }
      return Promise.resolve(answer);
    },
    remove: () => Promise.resolve(true),
  };
  return { backup, saved, pending };
}

function countingChannel() {
  let announced = 0;
  const forgets: number[] = [];
  const channel: IdentityChannel = {
    announce(news) {
      announced += 1;
      if (news?.forgotten === true) forgets.push(announced);
    },
    listen: () => () => {},
    close() {},
  };
  return {
    channel,
    forgets,
    get announced() {
      return announced;
    },
  };
}

function storedIn(storage: ReturnType<typeof createMemoryStorage>): unknown {
  return JSON.parse(storage.getItem(IDENTITY_KEY) ?? "null");
}

/** Lets queued promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("minting (§9.1)", () => {
  it("makes a v4 player id and a 43-character base64url secret, unregistered", () => {
    const identity = mintIdentity(NOW);
    expect(parsePlayerId(identity.playerId)).toBe(identity.playerId);
    expect(parseSecret(identity.secret)).toBe(identity.secret);
    expect(identity.secret).toHaveLength(43);
    expect(identity).toMatchObject({
      v: 1,
      registered: false,
      createdAt: NOW,
      source: "minted",
      cookieSavedAt: null,
    });
    expect(mintIdentity(NOW).playerId).not.toBe(identity.playerId);
  });

  it("encodes bytes as unpadded base64url and sets the UUID version and variant", () => {
    expect(base64url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe("-_-_");
    expect(base64url(new Uint8Array([1, 2]))).toBe("AQI");
    const uuid = uuidV4(counting(0));
    expect(uuid).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("decodes only well-formed identities", () => {
    const good = mintIdentity(NOW);
    expect(decodeLocalIdentity(JSON.parse(JSON.stringify(good)))).toEqual(good);
    for (const bad of [
      null,
      [],
      { ...good, v: 2 },
      { ...good, playerId: "not-a-uuid" },
      { ...good, secret: "short" },
      { ...good, registered: "yes" },
      { ...good, source: "guessed" },
      { ...good, cookieSavedAt: "soon" },
    ]) {
      expect(decodeLocalIdentity(bad)).toBeNull();
    }
  });

  it("restores a cookie identity as registered, with its cookie's age unknown", () => {
    const minted = mintIdentity(NOW);
    expect(
      identityFromBackup(
        { playerId: minted.playerId, secret: minted.secret },
        NOW + 5,
      ),
    ).toEqual({
      v: 1,
      playerId: minted.playerId,
      secret: minted.secret,
      registered: true,
      createdAt: NOW + 5,
      source: "cookie",
      cookieSavedAt: null,
    });
  });
});

describe("the local identity provider", () => {
  it("mints once, stores it, and loads the same identity on the next visit", () => {
    const storage = createMemoryStorage();
    const first = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => NOW,
    });
    const minted = first.current();
    expect(first.current()).toBe(minted);
    expect(first.stored).toBe(true);
    expect(JSON.parse(storage.getItem(IDENTITY_KEY) ?? "null")).toEqual(minted);

    const second = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => NOW + 1000,
    });
    expect(second.current()).toEqual(minted);
  });

  it("records registration once, and replace() swaps the identity", () => {
    const storage = createMemoryStorage();
    const provider = createLocalIdentityProvider({ kv: createKv({ storage }) });
    provider.markRegistered();
    expect(provider.current().registered).toBe(true);
    const restored: LocalIdentity = { ...mintIdentity(NOW), source: "sync" };
    provider.replace(restored);
    expect(provider.current()).toEqual(restored);
    expect(JSON.parse(storage.getItem(IDENTITY_KEY) ?? "null")).toEqual(
      restored,
    );
  });

  it("mints a new identity when the stored one is unreadable, keeping a quarantine copy", () => {
    const storage = createMemoryStorage({ [IDENTITY_KEY]: '{"v":1}' });
    const provider = createLocalIdentityProvider({ kv: createKv({ storage }) });
    expect(parsePlayerId(provider.current().playerId)).not.toBeNull();
    expect(storage.getItem("qz:quarantine:identity")).toBe('{"v":1}');
  });
});

describe("the backup cookie after registration (§9.1 step 2)", () => {
  it("posts the identity once registered, then records cookieSavedAt", async () => {
    const storage = createMemoryStorage();
    const { backup, saved } = recordingBackup("saved");
    let now = NOW;
    const provider = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => now as EpochMs,
      backup,
    });
    const identity = provider.current();
    expect(saved).toEqual([]);
    now = NOW + 60_000;
    provider.markRegistered();
    expect(provider.current()).toMatchObject({
      registered: true,
      cookieSavedAt: null,
    });
    expect(saved).toEqual([
      { playerId: identity.playerId, secret: identity.secret },
    ]);
    await settle();
    expect(provider.current().cookieSavedAt).toBe(NOW + 60_000);
    expect(
      JSON.parse(storage.getItem(IDENTITY_KEY) ?? "null").cookieSavedAt,
    ).toBe(NOW + 60_000);
    // Registered already: nothing more to post.
    provider.markRegistered();
    expect(saved).toHaveLength(1);
  });

  it("leaves cookieSavedAt empty when the post failed, so the next load retries", async () => {
    const { backup, saved } = recordingBackup("failed");
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => NOW,
      backup,
    });
    provider.markRegistered();
    await settle();
    expect(saved).toHaveLength(1);
    expect(provider.current().cookieSavedAt).toBeNull();
    await expect(provider.refreshBackup()).resolves.toBe(false);
    expect(saved).toHaveLength(2);
  });

  it("stamps cookieSavedAt when the route refused (403), so the post waits 7 days, not one load", async () => {
    const { backup, saved } = recordingBackup("refused");
    let now = NOW;
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => now as EpochMs,
      backup,
    });
    provider.markRegistered();
    await settle();
    expect(saved).toHaveLength(1);
    expect(provider.current().cookieSavedAt).toBe(NOW);
    // Five later loads within the week post nothing.
    for (let load = 1; load <= 5; load += 1) {
      now = NOW + load * DAY;
      await expect(provider.refreshBackup()).resolves.toBe(false);
    }
    expect(saved).toHaveLength(1);
    now = NOW + 7 * DAY;
    await provider.refreshBackup();
    expect(saved).toHaveLength(2);
  });

  it("stamps only the identity it posted, when another took its place meanwhile", async () => {
    const { backup, pending } = recordingBackup("hold");
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => NOW,
      backup,
    });
    provider.markRegistered();
    const other: LocalIdentity = { ...mintIdentity(NOW), source: "sync" };
    provider.replace(other);
    pending[0]?.("saved");
    await settle();
    expect(provider.current()).toEqual(other);
  });

  it("shares one request between triggers for the same credential", async () => {
    const { backup, saved, pending } = recordingBackup("hold");
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => NOW,
      backup,
    });
    provider.markRegistered();
    const refresh = provider.refreshBackup();
    expect(saved).toHaveLength(1);
    pending[0]?.("saved");
    await expect(refresh).resolves.toBe(true);
  });

  it("posts a registered identity that replace() brings, and never an unregistered one", async () => {
    const { backup, saved } = recordingBackup("saved");
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => NOW,
      backup,
    });
    provider.replace(mintIdentity(NOW));
    expect(saved).toHaveLength(0);
    const restored: LocalIdentity = {
      ...mintIdentity(NOW),
      registered: true,
      source: "claim",
    };
    provider.replace(restored);
    expect(saved).toEqual([
      { playerId: restored.playerId, secret: restored.secret },
    ]);
    await settle();
    expect(provider.current()).toMatchObject({
      playerId: restored.playerId,
      cookieSavedAt: NOW,
    });
  });

  it("never posts without a backup (tests, device namespaces)", async () => {
    const provider = createLocalIdentityProvider({ kv: createKv() });
    provider.markRegistered();
    await expect(provider.refreshBackup()).resolves.toBe(false);
  });
});

describe("the 7-day refresh (§9.1 step 3)", () => {
  const registered = (cookieSavedAt: number | null): LocalIdentity => ({
    ...mintIdentity(NOW),
    registered: true,
    cookieSavedAt: cookieSavedAt as EpochMs | null,
  });

  it("is due for a registered identity never saved, saved 7 days ago or more, or stamped in the future", () => {
    expect(backupDue(registered(null), NOW)).toBe(true);
    expect(backupDue(registered(NOW - BACKUP_REFRESH_MS), NOW)).toBe(true);
    expect(backupDue(registered(NOW - 30 * DAY), NOW)).toBe(true);
    expect(backupDue(registered(NOW + DAY), NOW)).toBe(true);
    expect(backupDue(registered(NOW - BACKUP_REFRESH_MS + 1), NOW)).toBe(false);
    expect(backupDue(registered(NOW), NOW)).toBe(false);
    expect(backupDue({ ...registered(null), registered: false }, NOW)).toBe(
      false,
    );
  });

  it("posts at most once every 7 days", async () => {
    const { backup, saved } = recordingBackup("saved");
    let now = NOW;
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => now as EpochMs,
      backup,
      initial: { identity: registered(NOW - 8 * DAY), stored: true },
    });
    await expect(provider.refreshBackup()).resolves.toBe(true);
    await expect(provider.refreshBackup()).resolves.toBe(false);
    now = NOW + 6 * DAY;
    await expect(provider.refreshBackup()).resolves.toBe(false);
    now = NOW + 7 * DAY;
    await expect(provider.refreshBackup()).resolves.toBe(true);
    expect(saved).toHaveLength(2);
  });
});

describe("other tabs (§6.4)", () => {
  it("announces every stored change", async () => {
    const counter = countingChannel();
    const { backup } = recordingBackup("saved");
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => NOW,
      backup,
      channel: counter.channel,
    });
    provider.current(); // minted and stored
    provider.markRegistered(); // registered
    await settle(); // cookieSavedAt
    provider.replace(mintIdentity(NOW)); // replaced
    expect(counter.announced).toBe(4);
  });

  it("takes in another tab's identity, and tells subscribers when the player changed", () => {
    const storage = createMemoryStorage();
    const tabA = createLocalIdentityProvider({ kv: createKv({ storage }) });
    const tabB = createLocalIdentityProvider({ kv: createKv({ storage }) });
    const first = tabA.current();
    expect(tabB.current()).toEqual(first);
    const heard: LocalIdentity[] = [];
    tabB.subscribe((identity) => heard.push(identity));

    tabA.markRegistered();
    expect(tabB.reload()).toBe(false); // same player, newer fields
    expect(tabB.current().registered).toBe(true);
    expect(heard).toEqual([]);

    const restored: LocalIdentity = { ...mintIdentity(NOW), source: "sync" };
    tabA.replace(restored);
    expect(tabB.reload()).toBe(true);
    expect(tabB.current()).toEqual(restored);
    expect(heard).toEqual([restored]);
    expect(tabB.reload()).toBe(false);
  });

  it("keeps its identity when another tab cleared or broke the key", () => {
    const storage = createMemoryStorage();
    const tab = createLocalIdentityProvider({ kv: createKv({ storage }) });
    const identity = tab.current();
    storage.removeItem(IDENTITY_KEY);
    expect(tab.reload()).toBe(false);
    storage.setItem(IDENTITY_KEY, "{broken");
    expect(tab.reload()).toBe(false);
    expect(tab.current()).toEqual(identity);
    // Another tab's broken value is that tab's to quarantine.
    expect(storage.getItem(IDENTITY_KEY)).toBe("{broken");
  });

  it("stores an in-memory identity only when told to", () => {
    const storage = createMemoryStorage();
    const minted = mintIdentity(NOW);
    const provider = createLocalIdentityProvider({
      kv: createKv({ storage }),
      initial: { identity: minted, stored: false },
    });
    expect(provider.stored).toBe(false);
    expect(provider.current()).toEqual(minted);
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    provider.persist();
    expect(provider.stored).toBe(true);
    expect(JSON.parse(storage.getItem(IDENTITY_KEY) ?? "null")).toEqual(minted);
  });

  it("stores an in-memory identity once it registers", () => {
    const storage = createMemoryStorage();
    const provider = createLocalIdentityProvider({
      kv: createKv({ storage }),
      initial: { identity: mintIdentity(NOW), stored: false },
    });
    provider.markRegistered();
    expect(provider.stored).toBe(true);
    expect(JSON.parse(storage.getItem(IDENTITY_KEY) ?? "null").registered).toBe(
      true,
    );
  });

  it("keeps notifying the other subscribers when one throws", () => {
    const provider = createLocalIdentityProvider({ kv: createKv() });
    provider.current();
    const heard: string[] = [];
    provider.subscribe(() => {
      throw new Error("bug");
    });
    const stop = provider.subscribe((identity) =>
      heard.push(identity.playerId),
    );
    const next = mintIdentity(NOW);
    provider.replace(next);
    stop();
    provider.replace(mintIdentity(NOW));
    expect(heard).toEqual([next.playerId]);
  });
});

describe("the first post of a minted identity (§9.6)", () => {
  it("is pending for a minted identity never posted, and only for one", () => {
    const minted = mintIdentity(NOW);
    expect(firstBackupPending(minted)).toBe(true);
    expect(firstBackupPending({ ...minted, registered: true })).toBe(true);
    expect(
      firstBackupPending({ ...minted, cookieSavedAt: NOW as EpochMs }),
    ).toBe(false);
    for (const source of ["cookie", "sync", "claim"] as const) {
      expect(firstBackupPending({ ...minted, source })).toBe(false);
    }
  });

  it("waits for confirmFirstBackup, and posts nothing when it says no", async () => {
    const { backup, saved } = recordingBackup("saved");
    const asked: string[] = [];
    let answer = false;
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => NOW,
      backup,
      confirmFirstBackup: (target) => {
        asked.push(target.playerId);
        return Promise.resolve(answer);
      },
    });
    const identity = provider.current();
    provider.markRegistered();
    await settle();
    expect(asked).toEqual([identity.playerId]);
    expect(saved).toEqual([]);
    expect(provider.current().cookieSavedAt).toBeNull();

    answer = true;
    await expect(provider.refreshBackup()).resolves.toBe(true);
    expect(saved).toEqual([
      { playerId: identity.playerId, secret: identity.secret },
    ]);
    // Posted once: the next refreshes never ask again.
    expect(provider.current().cookieSavedAt).toBe(NOW);
    expect(asked).toHaveLength(2);
  });

  it("never asks for an identity the cookie or the player brought", async () => {
    const { backup, saved } = recordingBackup("saved");
    let asked = 0;
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => NOW,
      backup,
      confirmFirstBackup: () => {
        asked += 1;
        return Promise.resolve(false);
      },
    });
    const restored = identityFromBackup(
      {
        playerId: mintIdentity(NOW).playerId,
        secret: mintIdentity(NOW).secret,
      },
      NOW as EpochMs,
    );
    provider.replace(restored);
    provider.replace({
      ...mintIdentity(NOW),
      registered: true,
      source: "sync",
    });
    await settle();
    expect(asked).toBe(0);
    expect(saved).toHaveLength(2);
  });

  it("keeps a registration in memory until the cookie answers, then stores it", async () => {
    const storage = createMemoryStorage();
    const { backup, saved } = recordingBackup("saved");
    let release: (answer: boolean) => void = () => {};
    const provider = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => NOW,
      backup,
      initial: { identity: mintIdentity(NOW), stored: false },
      confirmFirstBackup: () =>
        new Promise((resolve) => {
          release = (answer) => {
            if (answer) provider.persist();
            resolve(answer);
          };
        }),
    });
    provider.markRegistered();
    expect(provider.current().registered).toBe(true);
    expect(provider.stored).toBe(false);
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(saved).toEqual([]);
    release(true);
    await settle();
    expect(provider.stored).toBe(true);
    expect(storedIn(storage)).toMatchObject({
      registered: true,
      cookieSavedAt: NOW,
    });
    expect(saved).toHaveLength(1);
  });
});

describe("forgetting the identity (Delete my data, Under 13, §9.7)", () => {
  it("erase() removes the identity and the profile, tells the other tabs, and keeps a new one in memory only", async () => {
    const storage = createMemoryStorage();
    const counter = countingChannel();
    const { backup, saved } = recordingBackup("saved");
    const provider = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => NOW,
      backup,
      channel: counter.channel,
    });
    const old = provider.current();
    storage.setItem(PROFILE_KEY, JSON.stringify({ playerId: old.playerId }));
    const heard: string[] = [];
    provider.subscribe((next) => heard.push(next.playerId));

    provider.erase();
    expect(provider.forgotten).toBe(true);
    expect(provider.stored).toBe(false);
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(storage.getItem(PROFILE_KEY)).toBeNull();
    expect(counter.forgets).toEqual([counter.announced]);
    const fresh = provider.current();
    expect(fresh.playerId).not.toBe(old.playerId);
    expect(heard).toEqual([fresh.playerId]);

    // Nothing is stored, posted or announced again in this tab.
    const announced = counter.announced;
    provider.markRegistered();
    expect(provider.current().registered).toBe(true);
    provider.persist();
    provider.replace({
      ...mintIdentity(NOW),
      registered: true,
      source: "sync",
    });
    await expect(provider.refreshBackup()).resolves.toBe(false);
    await settle();
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(saved).toEqual([]);
    expect(counter.announced).toBe(announced);
  });

  it("an in-flight post never writes a forgotten identity back", async () => {
    const storage = createMemoryStorage();
    const { backup, pending } = recordingBackup("hold");
    const provider = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => NOW,
      backup,
    });
    provider.markRegistered();
    provider.erase();
    pending[0]?.("saved");
    await settle();
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
  });

  it("waits for the post in flight before saying it is idle", async () => {
    const { backup, pending } = recordingBackup("hold");
    const provider = createLocalIdentityProvider({
      kv: createKv(),
      now: () => NOW,
      backup,
    });
    await expect(provider.idle()).resolves.toBeUndefined();
    provider.markRegistered();
    let idle = false;
    void provider.idle().then(() => {
      idle = true;
    });
    provider.erase();
    await settle();
    expect(idle).toBe(false);
    pending[0]?.("saved");
    await settle();
    expect(idle).toBe(true);
  });

  it("a write-back that raced another tab's forget is removed again when the news arrives", async () => {
    const storage = createMemoryStorage();
    const { backup, pending } = recordingBackup("hold");
    const tabA = createLocalIdentityProvider({ kv: createKv({ storage }) });
    const tabB = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => NOW,
      backup,
    });
    tabA.current();
    tabB.markRegistered();
    tabA.erase();
    // Tab B's post lands, and its stamp writes the identity back, before
    // tab A's news reaches it.
    pending[0]?.("saved");
    await settle();
    expect(storage.getItem(IDENTITY_KEY)).not.toBeNull();
    tabB.reload({ forgotten: true });
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(tabB.forgotten).toBe(true);
  });

  it("keeps an identity another load stored after the forget", () => {
    const storage = createMemoryStorage();
    const tabA = createLocalIdentityProvider({ kv: createKv({ storage }) });
    const tabB = createLocalIdentityProvider({ kv: createKv({ storage }) });
    tabA.current();
    tabB.current();
    tabA.erase();
    // A fresh load minted its own before tab B heard the news.
    const fresh = mintIdentity(NOW);
    storage.setItem(IDENTITY_KEY, JSON.stringify(fresh));
    tabB.reload({ forgotten: true });
    expect(storedIn(storage)).toEqual(fresh);
  });

  it("a tab that hears another forget drops its copy and never writes it back", async () => {
    const storage = createMemoryStorage();
    const { backup, saved } = recordingBackup("saved");
    const tabA = createLocalIdentityProvider({ kv: createKv({ storage }) });
    const tabB = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => NOW,
      backup,
    });
    const old = tabA.current();
    expect(tabB.current()).toEqual(old);
    const heard: string[] = [];
    tabB.subscribe((next) => heard.push(next.playerId));

    tabA.erase();
    expect(tabB.reload({ forgotten: true })).toBe(true);
    expect(tabB.forgotten).toBe(true);
    expect(tabB.current().playerId).not.toBe(old.playerId);
    expect(heard).toEqual([tabB.current().playerId]);
    tabB.markRegistered();
    await expect(tabB.refreshBackup()).resolves.toBe(false);
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(saved).toEqual([]);
  });

  it("writes a registration back when storage was wiped under an open tab, unannounced (WebKit)", async () => {
    const storage = createMemoryStorage();
    const { backup, saved } = recordingBackup("saved");
    const tab = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => NOW,
      backup,
    });
    const identity = tab.current();
    storage.removeItem(IDENTITY_KEY);
    tab.markRegistered();
    await settle();
    // The server knows this player now: losing it would orphan the player.
    expect(storedIn(storage)).toMatchObject({
      playerId: identity.playerId,
      registered: true,
    });
    expect(saved).toHaveLength(1);
    expect(tab.forgotten).toBe(false);
  });

  it("the Under 13 flag makes every tab forget, and nothing is stored beside it", async () => {
    const storage = createMemoryStorage();
    const { backup, saved } = recordingBackup("saved");
    const tab = createLocalIdentityProvider({
      kv: createKv({ storage }),
      now: () => NOW,
      backup,
    });
    tab.current();
    // SET-1 clears the keys and writes the flag (§9.7).
    storage.removeItem(IDENTITY_KEY);
    storage.setItem(UNDER13_KEY, JSON.stringify({ since: NOW }));
    expect(tab.reload()).toBe(true);
    expect(tab.forgotten).toBe(true);
    tab.replace({ ...mintIdentity(NOW), registered: true, source: "sync" });
    tab.markRegistered();
    await settle();
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
    expect(saved).toEqual([]);

    // A provider that starts on a device with the flag never stores one either.
    const later = createLocalIdentityProvider({
      kv: createKv({ storage }),
      backup,
    });
    later.current();
    later.markRegistered();
    expect(later.forgotten).toBe(true);
    expect(storage.getItem(IDENTITY_KEY)).toBeNull();
  });

  it("a registration never overwrites another tab's different identity: it takes it", () => {
    const storage = createMemoryStorage();
    const tab = createLocalIdentityProvider({ kv: createKv({ storage }) });
    tab.current();
    const other: LocalIdentity = {
      ...mintIdentity(NOW),
      registered: true,
      source: "sync",
    };
    storage.setItem(IDENTITY_KEY, JSON.stringify(other));
    tab.markRegistered();
    expect(storedIn(storage)).toEqual(other);
    expect(tab.current()).toEqual(other);
  });
});
