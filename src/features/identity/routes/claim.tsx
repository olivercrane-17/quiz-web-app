/**
 * Route module (ARCHITECTURE §10.1): the claim confirm step (PRD §3.10.4,
 * DESIGN §12.27); the token never sits in a cached page. Served at
 * /claim/:token, which next.config.ts rewrites onto the static page
 * /shell/claim; the address bar keeps the original path.
 *
 * A stub until IDN-2, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/claim itself there is no param, and it
 * shows the invalid-link copy.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";

export const metadata: Metadata = {
  title: "Claim your streak",
  robots: { index: false },
};

export default function ClaimRoute() {
  return <PagePlaceholder title="Claim your streak" />;
}
