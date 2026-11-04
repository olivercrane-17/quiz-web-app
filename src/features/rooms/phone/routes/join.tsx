/**
 * Route module (ARCHITECTURE §10.1): the QR target (PRD §3.8.2, DESIGN
 * §12.32): it joins with the code and goes to the room. Served at
 * /join/:code, which next.config.ts rewrites onto the static page
 * /shell/join; the address bar keeps the original path.
 *
 * A stub until ROM-3, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/join/:code") (@/features/shell/client), never from
 * useParams or a one-off read of location.pathname: Next reuses this one
 * shell for every code, and keeps it mounted while hidden, so the param
 * changes under a mounted island (§10.2 rule 8). Reset per-code state when
 * it changes, or key the island by it. At /shell/join itself the param is
 * null, and it shows the invalid-link copy. The stub's <ShellParam> marker
 * goes with it. Beta: with the rooms flag off it is the not-found page, and
 * its metadata is the not-found page's own (`NOT_FOUND_METADATA`, R1-02),
 * which names no Beta feature (AC-ROM-13).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NOT_FOUND_METADATA, PagePlaceholder } from "@/features/shell";
import { ShellParam } from "@/features/shell/client";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = isFeatureEnabled("rooms")
  ? { title: "Joining a room", robots: { index: false } }
  : NOT_FOUND_METADATA;

export default function JoinRoomRoute() {
  if (!isFeatureEnabled("rooms")) notFound();
  return (
    <PagePlaceholder title="Joining a room">
      <ShellParam source="/join/:code" />
    </PagePlaceholder>
  );
}
