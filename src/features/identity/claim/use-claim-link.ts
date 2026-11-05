"use client";

/**
 * A claim link from inside an in-app browser (§9.5, PRD §3.10.4):
 *
 * 1. "Keep my streak" mints a 32-byte token on the device and calls
 *    `create_claim`, which keeps its hash for 10 minutes (a retry with the
 *    same token is the same claim).
 * 2. The address becomes `/claim/<token>` through `history.replaceState`,
 *    so the app's own "Open in browser" carries it. Next's router follows
 *    a native replaceState (its `usePathname` reads the new path) and the
 *    page stays as it is.
 * 3. The device remembers the token (`qz:sync`), so the link opened back
 *    here says the profile is already here instead of redeeming it.
 * 4. When the claim runs out, the address goes back to where it was, if
 *    it still shows the claim, and the card offers a new link. Leaving
 *    the card while the address still shows the claim puts it back too.
 */
import { useCallback, useEffect, useState } from "react";

import { getBackend } from "@/backend";
import type { EpochMs } from "@/engine/types";
import { getServerClock } from "@/platform/server-clock";

import { bootClient } from "../boot";
import { readDeviceIdentity } from "../device";
import { screenError, type ScreenError } from "../errors";
import { claimPath } from "../links";
import { mintClaimToken } from "../mint";
import { rememberClaim } from "../sync-store";

export type ClaimLinkState =
  | { phase: "idle" }
  | { phase: "creating" }
  | {
      phase: "live";
      /** `/claim/<token>`, now in the address bar. */
      path: string;
      /** Where the address goes back to. */
      returnTo: string;
      expiresAt: EpochMs;
    }
  | { phase: "expired" }
  | { phase: "error"; error: ScreenError };

/** The page's own address, to restore when the claim ends. */
function currentAddress(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

/** Puts the address back unless the page has moved on from the claim. */
function restoreAddress(path: string, returnTo: string): void {
  if (window.location.pathname === path) {
    // `null`, so Next copies its own state into the entry and follows along.
    window.history.replaceState(null, "", returnTo);
  }
}

export function useClaimLink() {
  const [state, setState] = useState<ClaimLinkState>({ phase: "idle" });

  const start = useCallback(async () => {
    setState({ phase: "creating" });
    await bootClient();
    const device = readDeviceIdentity();
    if (device === null || !device.registered) {
      // Only a profile the server knows can be claimed.
      setState({ phase: "error", error: "generic" });
      return;
    }
    const token = mintClaimToken();
    const backend = await getBackend();
    const result = await backend.identity.createClaim(token);
    if (!result.ok) {
      setState({ phase: "error", error: screenError(result.error) });
      return;
    }
    const { expiresAt } = result.value;
    rememberClaim(device.playerId, { token, expiresAt });
    const path = claimPath(token);
    const returnTo = currentAddress();
    window.history.replaceState(null, "", path);
    setState({ phase: "live", path, returnTo, expiresAt });
  }, []);

  const live = state.phase === "live" ? state : null;
  useEffect(() => {
    if (live === null) return;
    const left = Math.max(0, live.expiresAt - getServerClock().now());
    const timer = setTimeout(() => {
      restoreAddress(live.path, live.returnTo);
      setState({ phase: "expired" });
    }, left);
    return () => {
      clearTimeout(timer);
      restoreAddress(live.path, live.returnTo);
    };
  }, [live]);

  return { state, start };
}
