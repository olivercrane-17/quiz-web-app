/**
 * Route module (ARCHITECTURE §10.1): the claim confirm step (PRD §3.10.4,
 * DESIGN §12.27); the token never sits in a cached page. Served at
 * /claim/:token, which next.config.ts rewrites onto the static page
 * /shell/claim; the address bar keeps the original path.
 *
 * The page's heading is static, so every token gets the same prerendered
 * bytes. The island sits inside <Suspense> (§10.2 rule 2) and takes the
 * token from usePathParam("/claim/:token"), keyed by it, since Next reuses
 * this one shell for every token and keeps it mounted while hidden
 * (§10.2 rule 8). At /shell/claim itself there is no token, and it shows
 * the expired-link copy.
 */
import type { Metadata } from "next";
import { Suspense } from "react";

import { Loading, SkeletonText } from "@/ui/skeleton";

import { ClaimScreen } from "../claim/claim-screen";
import { IDENTITY_COPY } from "../copy";

export const metadata: Metadata = {
  title: IDENTITY_COPY.metadata.claim,
  robots: { index: false },
};

export default function ClaimRoute() {
  return (
    <div
      data-claim-page=""
      className="mx-auto flex w-full max-w-narrow flex-col gap-6 py-6"
    >
      <h1 className="font-display text-display-2">
        {IDENTITY_COPY.claimPage.title}
      </h1>
      <Suspense
        fallback={
          <Loading label={IDENTITY_COPY.claimPage.loading}>
            <SkeletonText lines={3} />
          </Loading>
        }
      >
        <ClaimScreen />
      </Suspense>
    </div>
  );
}
