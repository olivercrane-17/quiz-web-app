/**
 * Route module (ARCHITECTURE §10.1): the QR target (PRD §3.8.2, DESIGN
 * §12.32): it joins with the code and goes to the room. Served at
 * /join/:code, which next.config.ts rewrites onto the static page
 * /shell/join; the address bar keeps the original path.
 *
 * A stub until ROM-3, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/join itself there is no param, and it
 * shows the invalid-link copy. Beta: with the rooms flag off it is the
 * not-found page (AC-ROM-13).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = {
  title: "Joining a room",
  robots: { index: false },
};

export default function JoinRoomRoute() {
  if (!isFeatureEnabled("rooms")) notFound();
  return <PagePlaceholder title="Joining a room" />;
}
