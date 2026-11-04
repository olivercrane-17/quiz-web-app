/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's group offer, "Start
 * a Group for your chat", only when the player is in no Group and has
 * finished 2 or more Dailies (ctx.groupCount, ctx.streak).
 *
 * A stub until GRP-1, which keeps the export and fills isEligible and Card
 * (through OfferCard from @/features/offers/client). Until then it is never
 * eligible, so it never shows.
 */
import type { OfferProvider } from "@/features/offers";

function GroupOfferCard() {
  return null;
}

export const groupOffer: OfferProvider = {
  id: "group",
  isEligible: () => false,
  Card: GroupOfferCard,
};
