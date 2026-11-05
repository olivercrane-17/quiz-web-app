/**
 * Switching this device to a restored identity (§9.2, §9.5, §9.6): after
 * `redeem_sync_code` or `redeem_claim` answers, the caller stores the
 * restored identity through `IdentityProvider.replace` (SQL-2's contract).
 *
 * The tab's own provider lives inside the client boot (IDN-1's `boot.ts`),
 * which exports no `replace`. So this uses IDN-1's provider over the very
 * same storage, cross-tab channel and cookie routes, the way a second tab
 * would: `replace()` stores the identity, tells every tab (this one's boot
 * provider included, which adopts it, as it adopts any other tab's change)
 * and posts the backup cookie. The device's old identity stays on the
 * server untouched (§9.6 row 4). Device namespaces (mock builds) never
 * touch the cookie, as the lifecycle's rule says.
 *
 * Callers then load Today afresh (a full navigation), so every island
 * starts from the new identity whatever the boot provider has heard yet.
 */
import type { EpochMs, LocalIdentity } from "@/engine/types";
import {
  createHttpBackup,
  type BackupTransport,
} from "@/platform/identity/backup";
import {
  createIdentityChannel,
  type IdentityChannel,
} from "@/platform/identity/broadcast";
import {
  IDENTITY_KEY,
  createLocalIdentityProvider,
  decodeLocalIdentity,
} from "@/platform/identity/local";
import { getKv, type Kv } from "@/platform/storage";

/** How long the switch waits for the cookie post before letting the caller move on. */
export const ADOPT_WAIT_MS = 3000;

export interface AdoptOptions {
  kv?: Kv;
  now?: () => EpochMs;
  /** Default: the cookie routes, or none in a device namespace. */
  backup?: BackupTransport | null;
  /** Default: `BroadcastChannel('qz')` and storage events. */
  channel?: IdentityChannel | null;
  waitMs?: number;
}

/**
 * Makes `next` this device's identity: stored, announced to every tab and
 * posted to the backup cookie. Resolves true once it is stored (false when
 * the device keeps no identity: the Under 13 flag, §9.7), after the cookie
 * post has answered or `waitMs` has passed. Never rejects.
 */
export async function adoptIdentity(
  next: LocalIdentity,
  options: AdoptOptions = {},
): Promise<boolean> {
  const kv = options.kv ?? getKv();
  const backup =
    options.backup !== undefined
      ? options.backup
      : kv.device === null
        ? createHttpBackup()
        : null;
  const ownChannel = options.channel === undefined;
  const channel = ownChannel
    ? createIdentityChannel({ device: kv.device })
    : (options.channel ?? null);
  try {
    const current = kv.read(IDENTITY_KEY, decodeLocalIdentity, {
      quarantine: false,
    });
    const provider = createLocalIdentityProvider({
      kv,
      now: options.now,
      backup,
      channel,
      initial:
        current === null ? undefined : { identity: current, stored: true },
    });
    provider.replace(next);
    const stored = provider.stored && !provider.forgotten;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      provider.idle(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, options.waitMs ?? ADOPT_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    return stored;
  } catch {
    return false;
  } finally {
    if (ownChannel) channel?.close();
  }
}
