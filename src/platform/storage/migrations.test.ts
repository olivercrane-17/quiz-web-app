import { describe, expect, it, vi } from "vitest";

import { createKv, createMemoryStorage } from "./kv";
import {
  MIGRATION_LOCK,
  migrateStorage,
  runStorageMigrations,
} from "./migrations";
import { entrySize, quotaStorage } from "./testing";

const NOW = Date.parse("2026-11-01T09:00:00Z");
const IDENTITY = JSON.stringify({
  v: 1,
  playerId: "3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f",
  secret: "q3Jm8yZ0bW9ja19zZWNyZXRfdmFsdWVfMzJieXRlc00",
  registered: true,
  createdAt: NOW - 86_400_000,
  source: "minted",
  cookieSavedAt: null,
});

/** Storage as a build from before versioning left it: no qz:meta. */
function v0Snapshot(): Record<string, string> {
  return {
    "qz:identity": IDENTITY,
    "qz:settings": '{"theme":"dark","sound":"loud"}',
    "qz:history": "not json{",
    "qz:practice": '{"seen":{"p.geo.0142":1}}',
    "another-app:key": "kept",
  };
}

describe("storage migrations", () => {
  it("migrates a v0 snapshot to v1: meta stamped, garbage quarantined, the rest untouched", () => {
    const storage = createMemoryStorage(v0Snapshot());
    const kv = createKv({ storage });
    const report = migrateStorage(kv, NOW);
    expect(report).toEqual({
      from: 0,
      to: 1,
      applied: ["0->1"],
      quarantined: ["qz:history"],
      newerThanApp: false,
    });
    expect(JSON.parse(storage.getItem("qz:meta") ?? "null")).toEqual({
      storageVersion: 1,
      createdAt: NOW,
      migratedAt: NOW,
    });
    expect(storage.getItem("qz:history")).toBeNull();
    expect(storage.getItem("qz:quarantine:history")).toBe("not json{");
    expect(storage.getItem("qz:identity")).toBe(IDENTITY);
    expect(storage.getItem("qz:settings")).toBe(
      '{"theme":"dark","sound":"loud"}',
    );
    expect(storage.getItem("qz:practice")).toBe('{"seen":{"p.geo.0142":1}}');
    expect(storage.getItem("another-app:key")).toBe("kept");
  });

  it("quarantines on a full store without dropping any other key", () => {
    const snapshot = {
      ...v0Snapshot(),
      "qz:history": `not json{${"x".repeat(100)}`,
      "qz:outbox": '[{"id":"e1"}]',
      "qz:drafts:quiz-1": '{"title":"Mine"}',
    };
    const used = Object.entries(snapshot).reduce(
      (sum, [key, value]) => sum + entrySize(key, value, true),
      0,
    );
    // Five characters to spare: the copy (a longer key) never fits.
    const storage = quotaStorage(used + 5, snapshot, { countKeys: true });
    const report = migrateStorage(createKv({ storage }), NOW);
    expect(report.quarantined).toEqual(["qz:history"]);
    expect(storage.map.has("qz:history")).toBe(false);
    expect(storage.map.has("qz:quarantine:history")).toBe(false);
    const kept = Object.entries(snapshot).filter(
      ([key]) => key !== "qz:history",
    );
    expect(Object.fromEntries(storage.map)).toEqual({
      ...Object.fromEntries(kept),
      "qz:meta": JSON.stringify({
        storageVersion: 1,
        createdAt: NOW,
        migratedAt: NOW,
      }),
    });
  });

  it("never deletes the identity, even when it is not JSON", () => {
    const storage = createMemoryStorage({ "qz:identity": "{half an identity" });
    migrateStorage(createKv({ storage }), NOW);
    expect(storage.getItem("qz:identity")).toBe("{half an identity");
  });

  it("stamps a fresh device and is idempotent", () => {
    const storage = createMemoryStorage();
    const kv = createKv({ storage });
    expect(migrateStorage(kv, NOW).applied).toEqual(["0->1"]);
    const again = migrateStorage(kv, NOW + 5000);
    expect(again).toMatchObject({ from: 1, to: 1, applied: [] });
    expect(JSON.parse(storage.getItem("qz:meta") ?? "null")).toEqual({
      storageVersion: 1,
      createdAt: NOW,
      migratedAt: NOW,
    });
  });

  it("re-runs from v0 when qz:meta itself is broken", () => {
    const storage = createMemoryStorage({
      "qz:meta": '{"storageVersion":"one"}',
    });
    const report = migrateStorage(createKv({ storage }), NOW);
    expect(report.from).toBe(0);
    expect(JSON.parse(storage.getItem("qz:meta") ?? "null")).toMatchObject({
      storageVersion: 1,
    });
  });

  it("leaves storage from a newer build alone", () => {
    const meta = '{"storageVersion":2,"createdAt":1,"migratedAt":2}';
    const storage = createMemoryStorage({
      "qz:meta": meta,
      "qz:history": "not json{",
    });
    const report = migrateStorage(createKv({ storage }), NOW);
    expect(report.newerThanApp).toBe(true);
    expect(storage.getItem("qz:meta")).toBe(meta);
    expect(storage.getItem("qz:history")).toBe("not json{");
  });

  it("runs once at boot under a Web Lock, so two tabs never migrate at once", async () => {
    const request = vi.fn(async (_name: string, callback: () => unknown) =>
      callback(),
    );
    const kv = createKv({ storage: createMemoryStorage() });
    const report = await runStorageMigrations({
      kv,
      now: () => NOW,
      locks: { request } as never,
    });
    expect(request).toHaveBeenCalledWith(MIGRATION_LOCK, expect.any(Function));
    expect(report.to).toBe(1);
    const direct = await runStorageMigrations({
      kv: createKv({ storage: createMemoryStorage() }),
      now: () => NOW,
      locks: null,
    });
    expect(direct.applied).toEqual(["0->1"]);
  });
});
