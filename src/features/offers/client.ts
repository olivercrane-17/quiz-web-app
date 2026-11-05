/**
 * Offers' client entry: the card layout every provider renders its offer
 * through. `index.ts` never re-exports a "use client" module, because a
 * route whose server code imports a barrel gets every client module the
 * barrel re-exports in its first load, used or not (ARCHITECTURE §2.2).
 */
export { OfferCard, type OfferCardLayoutProps } from "./offer-card";
