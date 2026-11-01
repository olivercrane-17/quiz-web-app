/**
 * Route module (ARCHITECTURE §10.1): the phone in a room (PRD §3.8.2, DESIGN
 * §12.33): the lobby, every phase, and the removed, ended, full, locked and
 * reconnecting states. Served at /room/:roomId, which next.config.ts
 * rewrites onto the static page /shell/room; the address bar keeps the
 * original path.
 *
 * A stub until ROM-3, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/room itself there is no param, and it
 * shows the invalid-link copy. Beta: with the rooms flag off it is the
 * not-found page (AC-ROM-13).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = {
  title: "Room",
  robots: { index: false },
};

export default function RoomPhoneRoute() {
  if (!isFeatureEnabled("rooms")) notFound();
  return <PagePlaceholder title="Room" className="px-4" />;
}
