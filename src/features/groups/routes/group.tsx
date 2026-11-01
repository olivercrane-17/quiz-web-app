/**
 * Route module (ARCHITECTURE §10.1): the Group board (PRD §3.7.2, DESIGN
 * §12.20): the Today and This week tabs, refetched on focus and visibility.
 * Served at /g/:groupId, which next.config.ts rewrites onto the static page
 * /shell/group; the address bar keeps the original path.
 *
 * A stub until GRP-1, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/group itself there is no param, and it
 * shows the invalid-link copy.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";

export const metadata: Metadata = {
  title: "Group board",
  robots: { index: false },
};

export default function GroupBoardRoute() {
  return <PagePlaceholder title="Group board" />;
}
