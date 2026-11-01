/**
 * The mock database (ARCHITECTURE §7.4): one JSON document of tables, read
 * and written through `read(fn)` and `write(fn)`. This is the in-memory
 * variant for unit tests and the Wave 0 composition. DLY-1 adds the
 * persistent store: the document under localStorage['qz-mock:db:v1'],
 * every write inside navigator.locks.request('qz-mock-db'), reloading the
 * document first and posting { type: 'db_changed', tables } on
 * BroadcastChannel('qz-mock') after saving, so tabs share one server.
 */

/** Table name to rows; every value is plain JSON. */
export type MockDb = Record<string, unknown>;

export interface MockStore {
  /** Reads a consistent view. `fn` must not mutate it. */
  read<T>(fn: (db: Readonly<MockDb>) => T): T;
  /** Applies a change; `tables` names what changed, for listeners. */
  write<T>(fn: (db: MockDb) => T, tables?: readonly string[]): Promise<T>;
  /** Replaces the whole document (reset, scenarios). */
  replace(db: MockDb): Promise<void>;
  /** A deep copy of the document, for inspect(). */
  snapshot(): MockDb;
  /** Called after every write with the tables it named. */
  subscribe(listener: (tables: readonly string[]) => void): () => void;
}

function copy(db: MockDb): MockDb {
  return JSON.parse(JSON.stringify(db)) as MockDb;
}

export function createMemoryStore(initial: MockDb = {}): MockStore {
  let db = copy(initial);
  const listeners = new Set<(tables: readonly string[]) => void>();
  const notify = (tables: readonly string[]) => {
    for (const listener of listeners) listener(tables);
  };
  return {
    read: (fn) => fn(db),
    async write(fn, tables = []) {
      const next = copy(db);
      const result = fn(next);
      db = next;
      notify(tables);
      return result;
    },
    async replace(next) {
      db = copy(next);
      notify(Object.keys(next));
    },
    snapshot: () => copy(db),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
