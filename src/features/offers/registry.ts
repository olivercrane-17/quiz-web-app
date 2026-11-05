/**
 * Extension point (ARCHITECTURE §2.3): the offer providers in PRD priority
 * (§3.1.6 item 8): repair, claim, sync, install, calendar, group. Each
 * feature fills its own `offers/<id>.tsx`; this list only orders them.
 *
 * `pickOffer` returns the first eligible provider, so the stop screen shows
 * at most one card. DLY-3 adds the history rules (shown and dismissed
 * dates in `qz:offers`) here; the providers read the same history from
 * `ctx.history` for their own deferrals.
 */
import { repairOffer } from "@/features/archive/offers/repair";
import { groupOffer } from "@/features/groups/offers/group";
import { claimOffer } from "@/features/identity/offers/claim";
import { syncOffer } from "@/features/identity/offers/sync";
import { installOffer } from "@/features/install/offers/install";
import { calendarOffer } from "@/features/reminder/offers/calendar";

import type { OfferContext, OfferProvider } from "./types";

export const OFFER_PROVIDERS: readonly OfferProvider[] = [
  repairOffer,
  claimOffer,
  syncOffer,
  installOffer,
  calendarOffer,
  groupOffer,
];

/** The one card to show, or null. */
export function pickOffer(ctx: OfferContext): OfferProvider | null {
  return OFFER_PROVIDERS.find((provider) => provider.isEligible(ctx)) ?? null;
}
