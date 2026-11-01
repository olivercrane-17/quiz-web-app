"use client";

/**
 * Loads Today's Daily card with dynamic(), so its code is its own chunk
 * rather than part of Home's first load (§10.9 item 2: Next doesn't
 * code-split a client component that a server component imports). The
 * card still renders on the server, so its heading is in the HTML at once;
 * until the chunk arrives the same box holds its place.
 */
import dynamic from "next/dynamic";

import type { DailyHomeCardProps } from "./home-card";

const DailyHomeCard = dynamic(() =>
  import("./home-card").then((card) => card.DailyHomeCard),
);

export function DailyCardLoader(props: DailyHomeCardProps) {
  return <DailyHomeCard {...props} />;
}
