/**
 * Stop-screen offer cards (ARCHITECTURE §2.3, PRD §3.1.6 item 8). At most
 * one shows, chosen by priority: repair, claim, sync, install, calendar,
 * group. Each provider lives in its feature's `offers/<id>.tsx`, decides
 * from the context alone whether it applies, and renders its card.
 */
import type { ComponentType } from "react";

import type { BrowserContextInfo } from "@/backend";
import type {
  AgeBand,
  EpochMs,
  FinishSummary,
  StreakState,
} from "@/engine/types";

/** PRD priority order. */
export const OFFER_IDS = [
  "repair",
  "claim",
  "sync",
  "install",
  "calendar",
  "group",
] as const;
export type OfferId = (typeof OFFER_IDS)[number];

/** One offer's history in `qz:offers` (ARCHITECTURE §6.2), kept by the stop screen (DLY-3). */
export interface OfferRecord {
  shownCount: number;
  lastShownAt: EpochMs | null;
  dismissCount: number;
  lastDismissedAt: EpochMs | null;
  acceptedAt: EpochMs | null;
}

/** What every provider decides from. */
export interface OfferContext {
  /** The finished run the stop screen shows. */
  summary: FinishSummary;
  /** The streak after this finish; null while loading or after an error. The repair offer reads it. */
  streak: StreakState | null;
  /** From the profile; null until answered. Repair hides for the 13 to 17 band (PRD §3.1.6). */
  ageBand: AgeBand | null;
  /** In-app browsers get the claim link; installed apps never get the install pitch. */
  browser: BrowserContextInfo;
  /** The player's Groups; null while unknown. "Start a Group" needs 0 and 2 or more finished Dailies. */
  groupCount: number | null;
  /** Every offer's history, for "Not now" deferrals and caps. */
  history: Readonly<Partial<Record<OfferId, OfferRecord>>>;
  /** Server-corrected time. */
  now: EpochMs;
}

export interface OfferCardProps {
  ctx: OfferContext;
  /** The card's one action was taken (`offer_action` accept). */
  onAccept(): void;
  /** "Not now" (`offer_action` dismiss). */
  onDismiss(): void;
}

export interface OfferProvider {
  readonly id: OfferId;
  /** Pure: no storage, no network. */
  isEligible(ctx: OfferContext): boolean;
  /** Secondary action plus "Not now", never primary-styled (AC-DLY-14); `<OfferCard>` gives the layout. */
  readonly Card: ComponentType<OfferCardProps>;
}
