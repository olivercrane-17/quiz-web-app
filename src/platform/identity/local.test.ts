import { describe, expect, it } from "vitest";

import { parsePlayerId, parseSecret, type LocalIdentity } from "@/engine/types";
import { createKv, createMemoryStorage } from "@/platform/storage";

import {
  IDENTITY_KEY,
  IDENTITY_LOCK,
  base64url,
  createLocalIdentityProvider,
  decodeLocalIdentity,
  loadLocalIdentity,
  mintIdentity,
  uuidV4,
} from "./local";

const NOW = Date.UTC(2026, 10, 1, 9);

function counting(start = 0): (bytes: Uint8Array) => void {
  let next = start;
  return (bytes) => {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = next & 0xff;
      next += 1;
    }
  };
}

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

  it("loads or mints under a Web Lock, so tabs opened together share one identity", async () => {
    const storage = createMemoryStorage();
    const names: string[] = [];
    let held: Promise<unknown> = Promise.resolve();
    const locks = {
      request<T>(name: string, callback: () => T | Promise<T>): Promise<T> {
        names.push(name);
        const run = held.then(callback);
        held = run.catch(() => undefined);
        return run;
      },
    };
    const [a, b] = await Promise.all([
      loadLocalIdentity({ kv: createKv({ storage }), locks }),
      loadLocalIdentity({ kv: createKv({ storage }), locks }),
    ]);
    expect(names).toEqual([IDENTITY_LOCK, IDENTITY_LOCK]);
    expect(b.current().playerId).toBe(a.current().playerId);
  });
});
