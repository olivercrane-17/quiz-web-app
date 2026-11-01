/**
 * Route module (ARCHITECTURE §10.1): the Group invite landing (PRD §3.7.1,
 * DESIGN §12.22): joining in three screens at most. Served at /j/:code,
 * which next.config.ts rewrites onto the static page /shell/group-invite;
 * the address bar keeps the original path.
 *
 * A stub until GRP-1, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/group-invite itself there is no param,
 * and it shows the invalid-link copy.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";

export const metadata: Metadata = {
  title: "Group invite",
  robots: { index: false },
};

export default function GroupInviteRoute() {
  return <PagePlaceholder title="Group invite" />;
}
