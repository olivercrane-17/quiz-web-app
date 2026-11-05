/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's claim offer, the
 * in-app claim link (PRD §3.10.4): "Playing inside WhatsApp? Open Knewt in
 * your browser to keep your streak.", with that app's steps
 * (`ctx.browser`) and the sync code below as the fallback. Second in the
 * offers' priority, after repair.
 *
 * Eligible inside an in-app browser after its first finish there, until
 * the player takes it, and again a week later at most three times in all
 * (`claimOfferEligible`). The card loads with dynamic() (./cards.tsx).
 */
import type { OfferProvider } from "@/features/offers";

import { ClaimOfferCard } from "./cards";
import { claimOfferEligible } from "./eligibility";

export const claimOffer: OfferProvider = {
  id: "claim",
  isEligible: claimOfferEligible,
  Card: ClaimOfferCard,
};
