/**
 * The identity feature's addresses (ARCHITECTURE §10.1): the sync code,
 * restoring from one, and a claim link, which next.config.ts rewrites onto
 * the static `/shell/claim` page. Links we generate are path-only.
 */
import type { ClaimToken } from "@/engine/types";

export const SYNC_HREF = "/me/sync" as const;
export const RESTORE_HREF = "/restore" as const;
export const CLAIM_PATTERN = "/claim/:token" as const;

/** `/claim/<token>`: what the address bar shows while a claim link is live (§9.5). */
export function claimPath(token: ClaimToken): `/claim/${string}` {
  return `/claim/${token}`;
}
