import { describe, expect, it, vi } from "vitest";

import { createKv, createMemoryStorage } from "./kv";
import { quotaStorage as smallStorage, throwingStorage } from "./testing";

const asObject = (raw: unknown) =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;

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

  /** Device-only records (§6.5) on a store with 36 characters to spare. */
  const deviceOnly = () => ({
    "qz:identity": '{"id":"me"}',
    "qz:practice": `"${"p".repeat(40)}"`,
    "qz:drafts:quiz-1": `"${"d".repeat(40)}"`,
    "qz:outbox": `"${"o".repeat(40)}"`,
  });
  const asString = (raw: unknown) => (typeof raw === "string" ? raw : null);

  it("never lets a cache write evict keys worth more than the cache, falling back to memory", () => {
    const storage = smallStorage(220, deviceOnly(), { countKeys: true });
    const kv = createKv({ storage });
    const daily = "c".repeat(80);
    expect(kv.write("qz:cache:daily", daily)).toBe(false);
    expect(Object.fromEntries(storage.map)).toEqual(deviceOnly());
    // This tab still sees the cache until the next load.
    expect(kv.read("qz:cache:daily", asString)).toBe(daily);
  });

  it("lets a write evict only the keys ranked below it", () => {
    const storage = smallStorage(
      240,
      { ...deviceOnly(), "qz:quarantine:history": '"old"' },
      { countKeys: true },
    );
    const kv = createKv({ storage });
    // The history (rank 40) may push out the quarantine copy (rank 0) but
    // never the outbox (50), the practice record (80) or a draft (90).
    const history = "h".repeat(60);
    expect(kv.write("qz:history", history)).toBe(false);
    expect(Object.fromEntries(storage.map)).toEqual(deviceOnly());
    // The identity is never dropped, so its write may evict any ranked key,
    // and only stored keys: the history that lives in memory stays readable.
    expect(kv.write("qz:identity", { id: "me", secret: "s".repeat(50) })).toBe(
      true,
    );
    expect(storage.map.has("qz:outbox")).toBe(false);
    expect(storage.map.has("qz:practice")).toBe(true);
    expect(storage.map.has("qz:drafts:quiz-1")).toBe(true);
    expect(kv.read("qz:history", asString)).toBe(history);
  });

  it("quarantines a corrupt key on a full store without removing any other key", () => {
    const corrupt = `{${"h".repeat(30)}`;
    const storage = smallStorage(
      230,
      { ...deviceOnly(), "qz:history": corrupt },
      { countKeys: true },
    );
    const kv = createKv({ storage });
    expect(kv.read("qz:history", asObject)).toBeNull();
    // The copy did not fit, so it was skipped; the bad key still went.
    expect(Object.fromEntries(storage.map)).toEqual(deviceOnly());
    expect(kv.readRaw("qz:quarantine:history")).toEqual({ state: "missing" });
    expect(kv.readRaw("qz:history")).toEqual({ state: "missing" });

    // With room to spare the copy lands as before.
    const roomy = smallStorage(400, { "qz:history": corrupt });
    createKv({ storage: roomy }).quarantine("qz:history");
    expect(Object.fromEntries(roomy.map)).toEqual({
      "qz:quarantine:history": corrupt,
    });
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
