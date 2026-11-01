/**
 * Stop-screen offer cards. Providers import the types and `OfferCard` from
 * here; the stop screen imports the registry. Providers import types only,
 * so the registry's imports of the providers never form a runtime cycle.
 */
export { OfferCard, type OfferCardLayoutProps } from "./offer-card";
export { OFFER_PROVIDERS, pickOffer } from "./registry";
export {
  OFFER_IDS,
  type OfferCardProps,
  type OfferContext,
  type OfferId,
  type OfferProvider,
  type OfferRecord,
} from "./types";
