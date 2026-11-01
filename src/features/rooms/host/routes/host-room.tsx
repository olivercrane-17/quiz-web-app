/**
 * Route module (ARCHITECTURE §10.1): the host screen (PRD §3.8.3, DESIGN
 * §12.30): the join ticket and QR, the lobby, every host control and phase,
 * and the podium. Served at /host/:roomId, which next.config.ts rewrites
 * onto the static page /shell/host-room; the address bar keeps the original
 * path.
 *
 * A stub until ROM-2, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/host-room itself there is no param,
 * and it shows the invalid-link copy. Beta: with the rooms flag off it is
 * the not-found page (AC-ROM-13).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = {
  title: "Host screen",
  robots: { index: false },
};

export default function HostRoomRoute() {
  if (!isFeatureEnabled("rooms")) notFound();
  return <PagePlaceholder title="Host screen" />;
}
