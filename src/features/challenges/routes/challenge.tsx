/**
 * Route module (ARCHITECTURE §10.1): the challenge landing (PRD §3.6.3,
 * DESIGN §12.13): the challenger's result, Play, and the full, invalid,
 * expired and offline states. Served at /c/:code, which next.config.ts
 * rewrites onto the static page /shell/challenge; the address bar keeps the
 * original path.
 *
 * A stub until CHL-1, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/challenge itself there is no param,
 * and it shows the invalid-link copy.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";

export const metadata: Metadata = {
  title: "Challenge",
  robots: { index: false },
};

export default function ChallengeLandingRoute() {
  return <PagePlaceholder title="Challenge" />;
}
