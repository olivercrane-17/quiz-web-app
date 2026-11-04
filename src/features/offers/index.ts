/**
 * Stop-screen offer cards. Providers import the types from here and
 * `OfferCard` from `./client`; the stop screen imports the registry.
 * Providers import types only from here, so the registry's imports of the
 * providers never form a runtime cycle.
 */
export type { OfferCardLayoutProps } from "./offer-card";
export { OFFER_PROVIDERS, pickOffer } from "./registry";
export {
  OFFER_IDS,
  type OfferCardProps,
  type OfferContext,
  type OfferId,
  type OfferProvider,
  type OfferRecord,
} from "./types";
