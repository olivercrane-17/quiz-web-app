/**
 * The backend entry point (ARCHITECTURE §7.1). Features import only this
 * module and the types.
 *
 * - `getBackend()` loads the implementation chosen at build time by
 *   NEXT_PUBLIC_BACKEND_MODE with import(), once per tab, so no backend
 *   code is in the initial bundle.
 * - `prefetchBackend()` warms it: at idle after first paint, and on
 *   pointerdown of any Play button.
 * - `configureBackend({ identity })` is how the identity boot (DLY-1's local
 *   minting, then IDN-1's full lifecycle) hands the backend the tab's
 *   identity, which it adds to every call that needs one (§7.1, §9.1).
 */
import { selectContentWorld } from "@/content/loaders/world";
import { getBackendMode, type BackendMode } from "@/lib/env";
import type { IdentityProvider } from "@/platform/identity/provider";
import { getServerClock } from "@/platform/server-clock";

import type { BackendDeps } from "./deps";
import type { GameBackend } from "./types";

// The content world follows the backend (§5.6, §7.4): a mock build plays
// the fixture realm end to end, packs and answer lists included, and every
// other build the real bank. This runs as the module loads, before any
// island reaches a content loader (each awaits bootClient(), which imports
// this module).
selectContentWorld(getBackendMode() === "mock" ? "fixtures" : "bank");

let identityProvider: IdentityProvider | null = null;
let instance: Promise<GameBackend> | null = null;

/** Registers the tab's identity provider. The latest registration wins. */
export function configureBackend(config: { identity: IdentityProvider }): void {
  identityProvider = config.identity;
}

const deps: BackendDeps = {
  identity() {
    if (identityProvider === null) {
      throw new Error(
        "No identity provider: the identity boot must call configureBackend() before a call that needs identity.",
      );
    }
    return identityProvider;
  },
  get serverClock() {
    return getServerClock();
  },
};

async function load(mode: BackendMode): Promise<GameBackend> {
  switch (mode) {
    case "mock": {
      const { createMockBackend } = await import("./mock");
      return createMockBackend(deps);
    }
    case "supabase": {
      const { createSupabaseBackend } = await import("./supabase");
      return createSupabaseBackend(deps);
    }
    case "off": {
      const { createOffBackend } = await import("./off");
      return createOffBackend();
    }
  }
}

/** A memoized promise, one instance per tab. A failed load is retried on the next call. */
export function getBackend(): Promise<GameBackend> {
  instance ??= load(getBackendMode()).catch((error: unknown) => {
    instance = null;
    throw error;
  });
  return instance;
}

/** Warms the backend chunk; never throws. */
export function prefetchBackend(): void {
  getBackend().catch(() => {
    // A chunk that failed to load is retried by the next getBackend() call.
  });
}

/** Tests only: forgets the loaded backend and the registered identity. */
export function resetBackendForTests(): void {
  instance = null;
  identityProvider = null;
}

export type { BackendDeps } from "./deps";
export type { BackendMethod } from "./areas";
export type * from "./types";
export {
  BACKEND_ERROR_CODES,
  RETRYABLE,
  backendError,
  fail,
  isBackendErrorCode,
  ok,
} from "./errors";
