import { describe, expect, it } from "vitest";

import {
  MOCK_DB_KEY,
  MOCK_DB_LOCK,
  createMemoryStore,
  createPersistentStore,
  type MockChannelLike,
  type MockLocksLike,
  type MockStorageLike,
} from "./store";

function memoryStorage(): MockStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** Two ends of one BroadcastChannel, as two tabs hold it. */
function channelPair(): [MockChannelLike, MockChannelLike] {
  const inboxes: ((event: { data: unknown }) => void)[][] = [[], []];
  const end = (mine: number, theirs: number): MockChannelLike => ({
    postMessage(message) {
      for (const listener of inboxes[theirs] ?? []) {
        listener({ data: structuredClone(message) });
      }
    },
    addEventListener(_type, listener) {
      inboxes[mine]?.push(listener);
    },
    close() {},
  });
  return [end(0, 1), end(1, 0)];
}

describe.each([
  ["memory", () => createMemoryStore()],
  [
    "persistent",
    () =>
      createPersistentStore({
        storage: memoryStorage(),
        locks: null,
        channel: null,
      }),
  ],
])("the %s store", (_name, make) => {
  it("applies a write as one transaction and rolls back when it throws", async () => {
    const store = make();
    await store.write(
      (db) => {
        db.rows = { a: 1 };
      },
      ["rows"],
    );
    await expect(
      store.write((db) => {
        (db.rows as Record<string, number>).b = 2;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(
      store.write(async (db) => {
        (db.rows as Record<string, number>).c = 3;
        await Promise.resolve();
        throw new Error("later");
      }),
    ).rejects.toThrow("later");
    expect(store.snapshot()).toEqual({ rows: { a: 1 } });
  });

  it("runs writes one at a time, in order, even when they await", async () => {
    const store = make();
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3].map((n) =>
        store.write(async (db) => {
          const seen = (db.log as number[] | undefined) ?? [];
          await new Promise((resolve) => setTimeout(resolve, 5 - n));
          db.log = [...seen, n];
          order.push(n);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3]);
    expect(store.snapshot().log).toEqual([1, 2, 3]);
  });

  it("tells subscribers which tables a write named, and replace() swaps the document", async () => {
    const store = make();
    const heard: (readonly string[])[] = [];
    const unsubscribe = store.subscribe((tables) => heard.push(tables));
    await store.write(() => {}, ["attempts"]);
    await store.replace({ players: {} });
    unsubscribe();
    await store.write(() => {}, ["ignored"]);
    expect(heard).toEqual([["attempts"], ["players"]]);
    expect(store.snapshot()).toEqual({ players: {} });
    // The snapshot is a copy.
    (store.snapshot().players as Record<string, number>).x = 1;
    expect(store.snapshot()).toEqual({ players: {} });
  });
});

describe("the persistent store", () => {
  it("keeps the document under qz-mock:db:v1, where a second tab reads it", async () => {
    const storage = memoryStorage();
    const first = createPersistentStore({
      storage,
      locks: null,
      channel: null,
    });
    await first.write((db) => {
      db.attempts = { a1: { id: "a1" } };
    });
    expect(JSON.parse(storage.map.get(MOCK_DB_KEY) ?? "{}")).toEqual({
      attempts: { a1: { id: "a1" } },
    });
    const second = createPersistentStore({
      storage,
      locks: null,
      channel: null,
    });
    expect(second.read((db) => db.attempts)).toEqual({ a1: { id: "a1" } });
    // Each write starts from what storage holds now, another tab's writes included.
    await second.write((db) => {
      (db.attempts as Record<string, unknown>).a2 = { id: "a2" };
    });
    await first.write((db) => {
      db.seen = Object.keys(db.attempts as object);
    });
    expect(first.snapshot().seen).toEqual(["a1", "a2"]);
  });

  it("holds the Web Lock for every write and announces it to other tabs", async () => {
    const storage = memoryStorage();
    const requested: string[] = [];
    const locks: MockLocksLike = {
      request: (name, callback) => {
        requested.push(name);
        return callback();
      },
    };
    const [tabA, tabB] = channelPair();
    const a = createPersistentStore({ storage, locks, channel: tabA });
    const b = createPersistentStore({ storage, locks, channel: tabB });
    const heard: (readonly string[])[] = [];
    b.subscribe((tables) => heard.push(tables));
    await a.write(() => {}, ["attempts", "players"]);
    expect(requested).toEqual([MOCK_DB_LOCK]);
    expect(heard).toEqual([["attempts", "players"]]);
  });

  it("keeps working in memory when storage refuses writes", async () => {
    const storage: MockStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => {},
    };
    const store = createPersistentStore({
      storage,
      locks: null,
      channel: null,
    });
    await store.write((db) => {
      db.n = 1;
    });
    await store.write((db) => {
      db.n = (db.n as number) + 1;
    });
    expect(store.read((db) => db.n)).toBe(2);
  });

  it("starts empty when the stored document is unreadable", () => {
    const storage = memoryStorage();
    storage.map.set(MOCK_DB_KEY, "not json{");
    const store = createPersistentStore({
      storage,
      locks: null,
      channel: null,
    });
    expect(store.snapshot()).toEqual({});
  });
});
