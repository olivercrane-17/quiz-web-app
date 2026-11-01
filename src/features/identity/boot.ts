/**
 * The client boot (ARCHITECTURE §6.1, §9.1): the one entry point that runs
 * before any island reads storage or calls the backend. Every island that
 * reads storage (kv) or calls getBackend() awaits `bootClient()` first, in
 * an effect or an event handler. It is memoized per tab, so awaiting it
 * again costs nothing, and it never rejects.
 *
 * 1. Storage migrations (§6.1), under their Web Lock.
 * 2. The identity (§9.1): load or mint it and hand it to the backend with
 *    `configureBackend({ identity })`, so a call that needs identity never
 *    meets "No identity provider".
 *
 * Owners: CORE-0b creates this stub with step 1. DLY-1 adds step 2 with
 * the local identity it mints (`src/platform/identity/local.ts`), as a
 * Touch in Wave 1; IDN-1 owns the file from Wave 3 and swaps in the full
 * lifecycle (cookie restore, backup, cross-tab broadcast). The signature
 * stays as it is. It lives in a feature, not in `src/platform`, because the
 * platform layer may not import `@/backend` (§2.2).
 */
import { configureBackend } from "@/backend";
import { loadLocalIdentity } from "@/platform/identity/local";
import { runStorageMigrations } from "@/platform/storage";

let booted: Promise<void> | null = null;

async function boot(): Promise<void> {
  try {
    await runStorageMigrations();
  } catch {
    // The kv layer never throws, and a failed lock request leaves storage
    // as it was; the app keeps working on what is there.
  }
  // Step 2: load or mint the identity, then hand it to the backend. It runs
  // after the migrations, which never touch `qz:identity` (§6.1).
  try {
    configureBackend({ identity: await loadLocalIdentity() });
  } catch {
    // Without crypto.getRandomValues no identity can be minted (§9.1 step
    // 5); calls that need one then answer an error the screen shows.
  }
}

/** Runs the boot once per tab; resolves at once on the server. */
export function bootClient(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  booted ??= boot();
  return booted;
}

/** Tests only: lets the next bootClient() run the boot again. */
export function resetBootForTests(): void {
  booted = null;
}
