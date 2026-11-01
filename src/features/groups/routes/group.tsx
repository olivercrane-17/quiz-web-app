/**
 * Route module (ARCHITECTURE §10.1): the Group board (PRD §3.7.2, DESIGN
 * §12.20): the Today and This week tabs, refetched on focus and visibility.
 * Served at /g/:groupId, which next.config.ts rewrites onto the static page
 * /shell/group; the address bar keeps the original path.
 *
 * A stub until GRP-1, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/g/:groupId") (@/features/shell/client), never from
 * useParams or a one-off read of location.pathname: Next reuses this one
 * shell for every group, and keeps it mounted while hidden, so the param
 * changes under a mounted island (§10.2 rule 8). Reset per-group state when
 * it changes, or key the island by it. At /shell/group itself the param is
 * null, and it shows the invalid-link copy. The stub's <ShellParam> marker
 * goes with it.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";
import { ShellParam } from "@/features/shell/client";

export const metadata: Metadata = {
  title: "Group board",
  robots: { index: false },
};

export default function GroupBoardRoute() {
  return (
    <PagePlaceholder title="Group board">
      <ShellParam source="/g/:groupId" />
    </PagePlaceholder>
  );
}
