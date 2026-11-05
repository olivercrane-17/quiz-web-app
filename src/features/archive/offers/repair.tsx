/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's repair offer,
 * "Repair your streak" while a repair is possible (PRD §3.1.6 item 8,
 * §3.2.3), first in priority. It is never eligible for the 13 to 17 band,
 * who keep the option on the streak sheet (ctx.ageBand).
 *
 * A stub until ARC-1, which keeps the export and fills isEligible and Card
 * (through OfferCard from @/features/offers/client). Until then it is never
 * eligible, so it never shows.
 */
import type { OfferProvider } from "@/features/offers";

function RepairOfferCard() {
  return null;
}

export const repairOffer: OfferProvider = {
  id: "repair",
  isEligible: () => false,
  Card: RepairOfferCard,
};
