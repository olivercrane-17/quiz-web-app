/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's install offer, the
 * install pitch (PRD §3.11.3): never in an in-app browser or an installed
 * app, and "Not now" defers it 7 days, at most twice (ctx.history).
 *
 * A stub until CAL-1, which keeps the export and fills isEligible and Card
 * (through OfferCard from @/features/offers/client). Until then it is never
 * eligible, so it never shows.
 */
import type { OfferProvider } from "@/features/offers";

function InstallOfferCard() {
  return null;
}

export const installOffer: OfferProvider = {
  id: "install",
  isEligible: () => false,
  Card: InstallOfferCard,
};
