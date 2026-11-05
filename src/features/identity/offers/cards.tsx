"use client";

/**
 * The offer cards, each loaded with dynamic(), so the stop screen's first
 * load carries neither until one is chosen (ARCHITECTURE §10.9). The offer
 * card sits at the end of the stop screen, below the fold.
 */
import dynamic from "next/dynamic";

export const ClaimOfferCard = dynamic(() =>
  import("./claim-card").then((card) => card.ClaimCard),
);

export const SyncOfferCard = dynamic(() =>
  import("./sync-card").then((card) => card.SyncCard),
);
