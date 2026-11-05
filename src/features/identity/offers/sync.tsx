/**
 * Extension point (ARCHITECTURE §2.3): the stop screen's sync offer, the
 * sync code (PRD §3.10.2), at its triggers (§9.2): the third finished
 * Daily in a system browser, the first in a detectable private window,
 * and the 10th if the player never saved a code; never on a first finish
 * in an ordinary browser (AC-SYN-05). In an in-app browser it rides below
 * the claim card instead (`in_app_first`). Third in the offers' priority.
 *
 * The rules are `syncOfferEligible`; the card loads with dynamic()
 * (./cards.tsx) and reports accepted once the code is saved.
 */
import type { OfferProvider } from "@/features/offers";

import { SyncOfferCard } from "./cards";
import { syncOfferEligible } from "./eligibility";

export const syncOffer: OfferProvider = {
  id: "sync",
  isEligible: syncOfferEligible,
  Card: SyncOfferCard,
};
