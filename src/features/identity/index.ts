/**
 * The identity feature (ARCHITECTURE §9): what other features use. Nothing
 * here is a "use client" module (§2.2); the panels other screens mount come
 * from `./client`.
 *
 * - The client boot, which every island awaits before it reads storage or
 *   calls the backend (§6.1, §9.1), and IDN-1's identity hooks:
 *   `recoverIdentity` after `auth_failed` (§9.6), `forgetIdentity` for
 *   Delete my data and Under 13 (§9.7, SET-1), `onIdentityChange`.
 * - The sync code's and restore's addresses and labels, for the rows that
 *   lead there (Me, STA-1; Settings, SET-1; the installed first run,
 *   CAL-1), and the one line on what moves (AC-SYN-07).
 * - `syncCodeSavedAt`, so the stop screen (DLY-3) counts a code saved at
 *   `/me/sync` as the sync offer's accepted date.
 */
export {
  bootClient,
  forgetIdentity,
  onIdentityChange,
  recoverIdentity,
} from "./boot";
export { IDENTITY_COPY, WHAT_MOVES } from "./copy";
export { CLAIM_PATTERN, RESTORE_HREF, SYNC_HREF, claimPath } from "./links";
export type { SyncTrigger } from "./offers/eligibility";
export { syncCodeSavedAt } from "./sync-store";
