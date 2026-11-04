/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's calendar offer, the
 * calendar reminder (PRD §3.4.6): "Want a nudge? Add a daily reminder to
 * your calendar. We never send notifications." Never in an in-app browser or
 * for the 13 to 17 band.
 *
 * A stub until CAL-1, which keeps the export and fills isEligible and Card
 * (through OfferCard from @/features/offers/client). Until then it is never
 * eligible, so it never shows.
 */
import type { OfferProvider } from "@/features/offers";

function CalendarOfferCard() {
  return null;
}

export const calendarOffer: OfferProvider = {
  id: "calendar",
  isEligible: () => false,
  Card: CalendarOfferCard,
};
