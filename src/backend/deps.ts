/**
 * What every backend implementation is built with (ARCHITECTURE §7.1):
 * the tab's identity, which it adds to every call that needs one, and the
 * server clock it feeds with each response's server_time.
 */
import type { IdentityProvider } from "@/platform/identity/provider";
import type { ServerClock } from "@/platform/server-clock";

export interface BackendDeps {
  /**
   * The tab's identity provider. Resolved per call, because the identity
   * boot registers it (configureBackend) after the backend may have loaded.
   * Throws when nothing has registered one: a call that needs identity
   * before the boot ran is a bug.
   */
  identity(): IdentityProvider;
  serverClock: ServerClock;
}
