/**
 * Route module (ARCHITECTURE §10.1): the head-to-head result of an unranked
 * challenge run (PRD §3.6.3, DESIGN §12.15), with Rematch. Served at
 * /c/:code/result, which next.config.ts rewrites onto the static page
 * /shell/challenge-result; the address bar keeps the original path.
 *
 * A stub until CHL-1, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/challenge-result itself there is no
 * param, and it shows the invalid-link copy.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";

export const metadata: Metadata = {
  title: "Head-to-head",
  robots: { index: false },
};

export default function ChallengeResultRoute() {
  return <PagePlaceholder title="Head-to-head" />;
}
