/**
 * Client persistence (ARCHITECTURE §6): the kv layer, the key schema and
 * the boot-time migrations.
 */
export {
  createKv,
  createMemoryStorage,
  getKv,
  type Decoder,
  type Kv,
  type RawRead,
  type StorageLike,
} from "./kv";
export {
  MIGRATIONS,
  MIGRATION_LOCK,
  migrateStorage,
  runStorageMigrations,
  type LockManagerLike,
  type Migration,
  type MigrationContext,
  type MigrationReport,
} from "./migrations";
export {
  SESSION_KEYS,
  STORAGE_KEYS,
  STORAGE_VERSION,
  decodeMeta,
  isStorageKey,
  keyDefinition,
  quarantineKeyFor,
  type KeyDefinition,
  type SessionKey,
  type StorageKey,
  type StorageMeta,
} from "./schema";
