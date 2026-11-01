/**
 * The mock database (ARCHITECTURE §7.4, D14): one JSON document of tables,
 * read and written through `read(fn)` and `write(fn)`.
 *
 * - `createPersistentStore()` is what the mock backend uses in the browser.
 *   The document lives under `localStorage['qz-mock:db:v1']`, which is
 *   never namespaced by device (§6.1), so the "devices" of one browser
 *   context share one server. Every write runs inside
 *   `navigator.locks.request('qz-mock-db')`, reloads the document, applies
 *   the change to a copy, saves it, and posts `{ type: 'db_changed',
 *   tables }` on `BroadcastChannel('qz-mock')`, so tabs share one server and
 *   hear about each other's writes.
 * - `createMemoryStore()` is the variant for unit tests.
 *
 * Writes are transactions: `fn` works on a copy, and if it throws, nothing
 * is saved and the error propagates (as a raised error rolls back an RPC).
 * `fn` may be async; the lock is held until it settles, so the areas can
 * load fixture content inside a transaction. Without Web Locks (old
 * browsers, unit tests) writes are serialized inside the tab only. Without
 * usable localStorage the document lives in memory for the tab.
 */

/** Table name to rows; every value is plain JSON. */
export type MockDb = Record<string, unknown>;

export interface MockStore {
  /** Reads a consistent view. `fn` must not mutate it. */
  read<T>(fn: (db: Readonly<MockDb>) => T): T;
  /**
   * Applies a change as one transaction; `tables` names what changed, for
   * listeners. When `fn` throws or rejects, nothing is saved.
   */
  write<T>(
    fn: (db: MockDb) => T | Promise<T>,
    tables?: readonly string[],
  ): Promise<T>;
  /** Replaces the whole document (reset, scenarios). */
  replace(db: MockDb): Promise<void>;
  /** A deep copy of the document, for inspect(). */
  snapshot(): MockDb;
  /** Called after every write, this tab's and other tabs', with the tables it named. */
  subscribe(listener: (tables: readonly string[]) => void): () => void;
  /** Stops listening to other tabs (tests and page teardown). */
  close(): void;
}

/** The localStorage key of the mock database (§7.4). */
export const MOCK_DB_KEY = "qz-mock:db:v1";
/** The Web Lock every write holds. */
export const MOCK_DB_LOCK = "qz-mock-db";
/** The channel tabs announce their writes on. */
export const MOCK_DB_CHANNEL = "qz-mock";

/** The message a tab posts after a write. */
export interface DbChangedMessage {
  type: "db_changed";
  tables: string[];
}

/** The slice of Web Storage the store uses. */
export interface MockStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The slice of the Web Locks API the store uses. */
export interface MockLocksLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** The slice of BroadcastChannel the store uses. */
export interface MockChannelLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  close(): void;
}

function copy(db: Readonly<MockDb>): MockDb {
  return JSON.parse(JSON.stringify(db)) as MockDb;
}

function isDb(value: unknown): value is MockDb {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Serializes async work inside one tab: the stand-in for a Web Lock. */
function createMutex(): <T>(work: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  };
}

function createListeners() {
  const listeners = new Set<(tables: readonly string[]) => void>();
  return {
    add(listener: (tables: readonly string[]) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify(tables: readonly string[]): void {
      for (const listener of [...listeners]) {
        try {
          listener(tables);
        } catch {
          // A listener's bug never breaks the write that triggered it.
        }
      }
    },
  };
}

export function createMemoryStore(initial: MockDb = {}): MockStore {
  let db = copy(initial);
  const listeners = createListeners();
  const serialize = createMutex();
  return {
    read: (fn) => fn(db),
    write(fn, tables = []) {
      return serialize(async () => {
        const next = copy(db);
        const result = await fn(next);
        db = next;
        listeners.notify(tables);
        return result;
      });
    },
    replace(next) {
      return serialize(async () => {
        db = copy(next);
        listeners.notify(Object.keys(next));
      });
    },
    snapshot: () => copy(db),
    subscribe: (listener) => listeners.add(listener),
    close() {},
  };
}

function browserStorage(): MockStorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    localStorage.getItem(MOCK_DB_KEY);
    return localStorage;
  } catch {
    return null;
  }
}

function browserLocks(): MockLocksLike | null {
  try {
    const locks = (
      globalThis.navigator as { locks?: MockLocksLike } | undefined
    )?.locks;
    return locks ?? null;
  } catch {
    return null;
  }
}

function browserChannel(): MockChannelLike | null {
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    const channel = new BroadcastChannel(MOCK_DB_CHANNEL);
    // Node's BroadcastChannel (unit tests) would keep the process alive.
    (channel as { unref?: () => void }).unref?.();
    return channel;
  } catch {
    return null;
  }
}

function isDbChanged(data: unknown): data is DbChangedMessage {
  if (typeof data !== "object" || data === null) return false;
  const { type, tables } = data as Record<string, unknown>;
  return (
    type === "db_changed" &&
    Array.isArray(tables) &&
    tables.every((table) => typeof table === "string")
  );
}

export interface PersistentStoreOptions {
  /** Default: localStorage, when usable. Null: memory only. */
  storage?: MockStorageLike | null;
  /** Default: navigator.locks. Null: serialize inside this store only. */
  locks?: MockLocksLike | null;
  /** Default: BroadcastChannel('qz-mock'). Null: no cross-tab messages. */
  channel?: MockChannelLike | null;
  key?: string;
}

export function createPersistentStore(
  options: PersistentStoreOptions = {},
): MockStore {
  const key = options.key ?? MOCK_DB_KEY;
  const storage =
    options.storage === undefined ? browserStorage() : options.storage;
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const channel =
    options.channel === undefined ? browserChannel() : options.channel;
  const listeners = createListeners();
  const serialize = createMutex();

  /** The text last parsed, and its document: reads parse only when storage changed. */
  let cachedText: string | null = null;
  let cached: MockDb = {};
  /** Set once storage refused a write: the tab keeps going in memory. */
  let memoryOnly = storage === null;

  function load(): MockDb {
    if (memoryOnly || storage === null) return cached;
    let text: string | null;
    try {
      text = storage.getItem(key);
    } catch {
      return cached;
    }
    if (text === null) {
      cachedText = null;
      cached = {};
      return cached;
    }
    if (text !== cachedText) {
      try {
        const parsed: unknown = JSON.parse(text);
        cached = isDb(parsed) ? parsed : {};
      } catch {
        cached = {};
      }
      cachedText = text;
    }
    return cached;
  }

  function save(db: MockDb): void {
    const text = JSON.stringify(db);
    cached = JSON.parse(text) as MockDb;
    cachedText = text;
    if (memoryOnly || storage === null) return;
    try {
      storage.setItem(key, text);
    } catch {
      // Full or blocked storage: this tab keeps the server in memory.
      memoryOnly = true;
    }
  }

  function announce(tables: readonly string[]): void {
    listeners.notify(tables);
    try {
      channel?.postMessage({
        type: "db_changed",
        tables: [...tables],
      } satisfies DbChangedMessage);
    } catch {
      // A closed channel only costs other tabs a refresh.
    }
  }

  channel?.addEventListener("message", (event) => {
    if (isDbChanged(event.data)) listeners.notify(event.data.tables);
  });

  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    // The in-tab queue keeps this tab's writes in order; the Web Lock keeps
    // tabs apart.
    return serialize(() =>
      locks === null ? work() : locks.request(MOCK_DB_LOCK, work),
    );
  }

  return {
    read: (fn) => fn(load()),
    write(fn, tables = []) {
      return exclusive(async () => {
        const next = copy(load());
        const result = await fn(next);
        save(next);
        announce(tables);
        return result;
      });
    },
    replace(next) {
      return exclusive(async () => {
        save(copy(next));
        announce(Object.keys(next).length > 0 ? Object.keys(next) : ["*"]);
      });
    },
    snapshot: () => copy(load()),
    subscribe: (listener) => listeners.add(listener),
    close() {
      try {
        channel?.close();
      } catch {
        // Already closed.
      }
    },
  };
}
