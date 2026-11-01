/**
 * The identity the backend adds to every call that needs it (ARCHITECTURE
 * §7.1, §9.1). The backend is built with one; feature code never handles
 * secrets. DLY-1 implements minting (local.ts), IDN-1 completes the
 * lifecycle: load, cookie restore, mint, the backup cookie and cross-tab
 * broadcast.
 */
import type { LocalIdentity } from "@/engine/types";

export interface IdentityProvider {
  /** Mints on first use; never null. */
  current(): LocalIdentity;
  /** After the first successful write; triggers the cookie backup. */
  markRegistered(): void;
  /** After a sync-code or claim restore. */
  replace(next: LocalIdentity): void;
}
