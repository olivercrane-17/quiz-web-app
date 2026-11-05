/**
 * The identity feature's words (ARCHITECTURE §2.4): page titles and the
 * labels other features show for these pages (SET-1's profile rows, STA-1's
 * link on Me), plus everything the islands render (`client-copy.ts`).
 */
import { IDENTITY_CLIENT_COPY, WHAT_MOVES } from "./client-copy";

export { APP_NAMES, IDENTITY_CLIENT_COPY, WHAT_MOVES } from "./client-copy";

export const IDENTITY_COPY = {
  ...IDENTITY_CLIENT_COPY,
  metadata: {
    sync: "Your sync code",
    restore: "Restore from a code",
    claim: "Claim your streak",
  },
  /**
   * The rows that lead here (DESIGN §12.23, §12.28): "Your sync code" on
   * Me, and Settings' Your profile rows.
   */
  links: {
    sync: "Your sync code",
    restore: "Restore from a code",
  },
  /** The top bar's Back on `/me/sync`. */
  backToMe: "Back to Me",
  whatMoves: WHAT_MOVES,
} as const;
