/**
 * The client boot (ARCHITECTURE §6.1, §9.1): the one entry point that runs
 * before any island reads storage or calls the backend. Every island that
 * reads storage (kv) or calls getBackend() awaits `bootClient()` first, in
 * an effect or an event handler. It is memoized per tab, so awaiting it
 * again costs nothing, and it never rejects.
 *
 * 1. Storage migrations (§6.1), under their Web Lock. They never touch
 *    `qz:identity`.
 * 2. The identity (§9.1, §9.6), through `loadIdentity()`: the stored one;
 *    else the backup cookie's, restored silently, which logs
 *    `identity_restored` (source `cookie`) and `storage_lost` (AC-CKE-02);
 *    else a new one. It is handed to the backend with
 *    `configureBackend({ identity })`, so a call that needs identity never
 *    meets "No identity provider". From then on the identity posts its
 *    backup cookie after registration and every 7 days, and follows the
 *    other tabs.
 *
 * Owners: CORE-0b created this file with step 1 and DLY-1 added the first
 * step 2. IDN-1 owns it from Wave 3. The signature of `bootClient` stays.
 * It lives in a feature, not in `src/platform`, because the platform layer
 * may not import `@/backend` (§2.2).
 */
import { configureBackend } from "@/backend";
import type { LocalIdentity } from "@/engine/types";
import { track } from "@/features/analytics/track";
import {
  loadIdentity,
  type ManagedIdentity,
  type RecoveryOutcome,
} from "@/platform/identity/lifecycle";
import { runStorageMigrations } from "@/platform/storage";

let booted: Promise<void> | null = null;
let identity: ManagedIdentity | null = null;

async function boot(): Promise<void> {
  try {
    await runStorageMigrations();
  } catch {
    // The kv layer never throws, and a failed lock request leaves storage
    // as it was; the app keeps working on what is there.
  }
  try {
    identity = await loadIdentity({
      onRestored(source) {
        // PRD §3.10.3: a wiped store came back through the backup cookie.
        track("identity_restored", { source });
        track("storage_lost", {});
      },
    });
    configureBackend({ identity });
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

/**
 * After a write failed with `auth_failed` (§9.6, §7.3): one cookie restore,
 * else a new identity. `restored` means the write is worth retrying;
 * `minted` means the player starts again and the screen says so ("We
 * couldn't find your profile on this device, so we started a new one. If
 * you saved a sync code, you can restore it in Settings."). Null when the
 * tab has no identity at all.
 */
export async function recoverIdentity(): Promise<RecoveryOutcome | null> {
  await bootClient();
  return identity === null ? null : identity.recover();
}

/**
 * Calls `listener` whenever the tab's player changes: another tab restored
 * or replaced it, or a recovery started a new one. Returns the unsubscribe.
 */
export function onIdentityChange(
  listener: (next: LocalIdentity) => void,
): () => void {
  let stop: (() => void) | null = null;
  let stopped = false;
  void bootClient().then(() => {
    if (!stopped && identity !== null) stop = identity.subscribe(listener);
  });
  return () => {
    stopped = true;
    stop?.();
  };
}

/** Tests only: lets the next bootClient() run the boot again. */
export function resetBootForTests(): void {
  identity?.dispose();
  identity = null;
  booted = null;
}
