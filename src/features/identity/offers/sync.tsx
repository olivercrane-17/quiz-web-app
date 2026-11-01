/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's sync offer, the
 * sync code (PRD §3.10.2), offered at its triggers (ARCHITECTURE §9.2).
 *
 * A stub until IDN-2, which keeps the export and fills isEligible and Card
 * (through OfferCard from @/features/offers). Until then it is never
 * eligible, so it never shows.
 */
import type { OfferProvider } from "@/features/offers";

function SyncOfferCard() {
  return null;
}

export const syncOffer: OfferProvider = {
  id: "sync",
  isEligible: () => false,
  Card: SyncOfferCard,
};
