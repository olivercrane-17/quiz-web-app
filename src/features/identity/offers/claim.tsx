/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's claim offer, the
 * in-app claim link (PRD §3.10.4): "Playing inside WhatsApp? Open Knewt in
 * your browser to keep your streak.", with that app's steps (ctx.browser).
 *
 * A stub until IDN-2, which keeps the export and fills isEligible and Card
 * (through OfferCard from @/features/offers). Until then it is never
 * eligible, so it never shows.
 */
import type { OfferProvider } from "@/features/offers";

function ClaimOfferCard() {
  return null;
}

export const claimOffer: OfferProvider = {
  id: "claim",
  isEligible: () => false,
  Card: ClaimOfferCard,
};
