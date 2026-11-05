/**
 * The identity the backend adds to every call that needs it (ARCHITECTURE
 * §7.1, §9.1). The backend is built with one; feature code never handles
 * secrets. The tab's provider comes from `lifecycle.ts` (load, cookie
 * restore, mint, §9.6) through the client boot, and `local.ts` keeps it:
 * the backup cookie after registration, the 7-day refresh and the
 * cross-tab broadcast.
 */
import type { LocalIdentity } from "@/engine/types";

/** What a recovery did (§9.6, §7.3 `auth_failed`). */
export type RecoveryOutcome = "restored" | "minted";

/** The credential a call was sent with. */
export type SentCredential = Pick<LocalIdentity, "playerId" | "secret">;

export interface IdentityProvider {
  /** Mints on first use; never null. */
  current(): LocalIdentity;
  /**
   * After the first successful write: records `registered` and posts the
   * identity to the backup cookie (`POST /api/identity`). Calling it again
   * once registered does nothing.
   */
  markRegistered(): void;
  /**
   * After a sync-code or claim restore: stores `next`, tells the other tabs,
   * and posts it to the backup cookie when it is registered.
   */
  replace(next: LocalIdentity): void;
  /**
   * After a call sent with `failed` answered `auth_failed` (a wrong or
   * pruned credential, §9.6): one backup-cookie restore, else a new
   * identity. `restored` means `current()` is worth one retry (it may have
   * moved on already, in another tab or an earlier recovery); `minted`
   * means the player starts again. The tab's provider is the lifecycle's
   * (`ManagedIdentity.recover`, IDN-1); one without it leaves `auth_failed`
   * as the answer.
   */
  recover?(failed: SentCredential): Promise<RecoveryOutcome>;
}
