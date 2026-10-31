import { describe, expect, it, vi } from "vitest";

import { createKv, createMemoryStorage, type StorageLike } from "./kv";

const asObject = (raw: unknown) =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;

/** A storage that refuses everything, as some private windows do. */
function throwingStorage(): StorageLike {
  const fail = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return {
    get length(): number {
      return fail();
    },
    key: fail,
    getItem: fail,
    setItem: fail,
    removeItem: fail,
  };
}

/** A storage that holds at most `capacity` characters of values. */
function smallStorage(
  capacity: number,
  initial: Record<string, string> = {},
): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  const used = () =>
    [...map.values()].reduce((sum, value) => sum + value.length, 0);
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem(key, value) {
      const before = map.get(key)?.length ?? 0;
      if (used() - before + value.length > capacity) {
        throw new DOMException("full", "QuotaExceededError");
      }
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("kv", () => {
  it("round-trips JSON values through per-key decoders", () => {
    const kv = createKv({ storage: createMemoryStorage() });
    expect(kv.write("qz:offers", { shown: 2 })).toBe(true);
    expect(kv.read("qz:offers", asObject)).toEqual({ shown: 2 });
    expect(kv.read("qz:history", asObject)).toBeNull();
    kv.remove("qz:offers");
    expect(kv.readRaw("qz:offers")).toEqual({ state: "missing" });
  });

  it("falls back to memory without storage, and never throws when localStorage throws", () => {
    const memory = createKv({ storage: null });
    expect(memory.persistent).toBe(false);
    expect(memory.write("qz:settings", { v: 1 })).toBe(true);
    expect(memory.read("qz:settings", asObject)).toEqual({ v: 1 });

    const blocked = createKv({ storage: throwingStorage() });
    expect(() =>
      blocked.write("qz:settings", { v: 1, theme: "dark" }),
    ).not.toThrow();
    // The write could not land, so this tab keeps it in memory and behaves the same.
    expect(blocked.read("qz:settings", asObject)).toEqual({
      v: 1,
      theme: "dark",
    });
    expect(() => blocked.keys()).not.toThrow();
    expect(() => blocked.remove("qz:settings")).not.toThrow();
    expect(blocked.read("qz:settings", asObject)).toBeNull();
  });

  it("uses the memory fallback when the page's localStorage throws on access", async () => {
    vi.resetModules();
    const spy = vi
      .spyOn(globalThis, "localStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
    const { getKv } = await import("./kv");
    const kv = getKv();
    expect(kv.persistent).toBe(false);
    expect(kv.write("qz:offers", [1])).toBe(true);
    expect(
      kv.read("qz:offers", (raw) => (Array.isArray(raw) ? raw : null)),
    ).toEqual([1]);
    spy.mockRestore();
  });

  it("quarantines a value its decoder refuses, keeping the rest", () => {
    const storage = createMemoryStorage({
      "qz:history": "not json{",
      "qz:offers": '{"shown":1}',
      "qz:settings": "[1,2]",
    });
    const kv = createKv({ storage });
    expect(kv.read("qz:history", asObject)).toBeNull();
    expect(kv.read("qz:settings", asObject)).toBeNull();
    expect(storage.getItem("qz:history")).toBeNull();
    expect(storage.getItem("qz:quarantine:history")).toBe("not json{");
    expect(storage.getItem("qz:quarantine:settings")).toBe("[1,2]");
    expect(kv.read("qz:offers", asObject)).toEqual({ shown: 1 });
  });

  it("can read without quarantining, for owners that must never lose a value", () => {
    const storage = createMemoryStorage({ "qz:identity": "{broken" });
    const kv = createKv({ storage });
    expect(kv.read("qz:identity", asObject, { quarantine: false })).toBeNull();
    expect(storage.getItem("qz:identity")).toBe("{broken");
  });

  it("drops the least valuable keys first when storage is full", () => {
    const storage = smallStorage(50, {
      "qz:identity": '{"id":"me"}',
      "qz:cache:daily": '"xxxxxxxxxxxx"',
      "qz:practice": '"yyyyyyyyyy"',
    });
    const kv = createKv({ storage });
    expect(kv.write("qz:history", "z".repeat(20))).toBe(true);
    expect(storage.map.has("qz:cache:daily")).toBe(false);
    expect(storage.map.has("qz:practice")).toBe(true);
    expect(storage.map.has("qz:identity")).toBe(true);
  });

  it("never drops identity or settings, and keeps a write it can't land in memory", () => {
    const storage = smallStorage(40, {
      "qz:identity": '{"id":"me"}',
      "qz:settings": '{"v":1}',
    });
    const kv = createKv({ storage });
    expect(kv.write("qz:practice", "p".repeat(60))).toBe(false);
    expect(storage.map.has("qz:identity")).toBe(true);
    expect(storage.map.has("qz:settings")).toBe(true);
    expect(
      kv.read("qz:practice", (raw) => (typeof raw === "string" ? raw : null)),
    ).toBe("p".repeat(60));
  });

  it("refuses values that are not JSON", () => {
    const kv = createKv({ storage: createMemoryStorage() });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(kv.write("qz:offers", cyclic)).toBe(false);
    expect(kv.write("qz:offers", undefined)).toBe(false);
    expect(kv.write("qz:offers", BigInt(10))).toBe(false);
  });

  it("namespaces a test device's keys and lists only its own", () => {
    const storage = createMemoryStorage({
      "qz:settings": '{"v":1}',
      "qz-mock:db:v1": "{}",
    });
    const phone = createKv({ storage, device: "phone3" });
    phone.write("qz:settings", { v: 1, theme: "dark" });
    phone.write("qz:runs:abc", { index: 1 });
    expect(storage.getItem("qz:d:phone3:settings")).toBe(
      '{"v":1,"theme":"dark"}',
    );
    expect(phone.keys().sort()).toEqual(["qz:runs:abc", "qz:settings"]);
    const main = createKv({ storage });
    expect(main.keys()).toEqual(["qz:settings"]);
    expect(main.read("qz:settings", asObject)).toEqual({ v: 1 });
    expect(createKv({ storage, device: "Bad Name!" }).device).toBeNull();
  });
});
