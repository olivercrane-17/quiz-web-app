/**
 * Route module (ARCHITECTURE §10.1): the claim confirm step (PRD §3.10.4,
 * DESIGN §12.27); the token never sits in a cached page. Served at
 * /claim/:token, which next.config.ts rewrites onto the static page
 * /shell/claim; the address bar keeps the original path.
 *
 * A stub until IDN-2, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/claim/:token") (@/features/shell/client), never from
 * useParams or a one-off read of location.pathname: Next reuses this one
 * shell for every token, and keeps it mounted while hidden, so the param
 * changes under a mounted island (§10.2 rule 8). Reset per-token state when
 * it changes, or key the island by it. At /shell/claim itself the param is
 * null, and it shows the invalid-link copy. The stub's <ShellParam> marker
 * goes with it.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";
import { ShellParam } from "@/features/shell/client";

export const metadata: Metadata = {
  title: "Claim your streak",
  robots: { index: false },
};

export default function ClaimRoute() {
  return (
    <PagePlaceholder title="Claim your streak">
      <ShellParam source="/claim/:token" />
    </PagePlaceholder>
  );
}
