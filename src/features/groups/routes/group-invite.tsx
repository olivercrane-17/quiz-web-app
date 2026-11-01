/**
 * Route module (ARCHITECTURE §10.1): the Group invite landing (PRD §3.7.1,
 * DESIGN §12.22): joining in three screens at most. Served at /j/:code,
 * which next.config.ts rewrites onto the static page /shell/group-invite;
 * the address bar keeps the original path.
 *
 * A stub until GRP-1, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/j/:code") (@/features/shell/client), never from useParams
 * or a one-off read of location.pathname: Next reuses this one shell for
 * every code, and keeps it mounted while hidden, so the param changes under
 * a mounted island (§10.2 rule 8). Reset per-code state when it changes, or
 * key the island by it. At /shell/group-invite itself the param is null,
 * and it shows the invalid-link copy. The stub's <ShellParam> marker goes
 * with it.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";
import { ShellParam } from "@/features/shell/client";

export const metadata: Metadata = {
  title: "Group invite",
  robots: { index: false },
};

export default function GroupInviteRoute() {
  return (
    <PagePlaceholder title="Group invite">
      <ShellParam source="/j/:code" />
    </PagePlaceholder>
  );
}
