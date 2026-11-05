/**
 * The identity feature's client entry (ARCHITECTURE §2.2): the panels
 * other screens mount. `index.ts` never re-exports a "use client" module,
 * so a route that imports it pays nothing for these.
 *
 * - `SyncCodePanel`: the sync code with Copy code and I've saved it. The
 *   iOS install pitch and the installed first run (CAL-1, triggers
 *   `pre_install` and `manual`) and the first server-saved quiz (EDT-3,
 *   `first_quiz`) mount it with their trigger.
 * - `ClaimPanel`: the claim link for an in-app browser, for any screen
 *   that wants to offer it outside the stop screen's card.
 */
export { ClaimPanel, type ClaimPanelProps } from "./claim/claim-panel";
export { SyncCodePanel, type SyncCodePanelProps } from "./sync/sync-code-panel";
