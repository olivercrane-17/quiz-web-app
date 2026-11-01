/**
 * Route module (ARCHITECTURE §10.1): the host screen (PRD §3.8.3, DESIGN
 * §12.30): the join ticket and QR, the lobby, every host control and phase,
 * and the podium. Served at /host/:roomId, which next.config.ts rewrites
 * onto the static page /shell/host-room; the address bar keeps the original
 * path.
 *
 * A stub until ROM-2, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/host/:roomId") (@/features/shell/client), never from
 * useParams or a one-off read of location.pathname: Next reuses this one
 * shell for every room, and keeps it mounted while hidden, so the param
 * changes under a mounted island (§10.2 rule 8). Reset per-room state when
 * it changes, or key the island by it. At /shell/host-room itself the param
 * is null, and it shows the invalid-link copy. The stub's <ShellParam>
 * marker goes with it. Beta: with the rooms flag off it is the not-found
 * page, and its metadata carries no title, so no HTML mentions rooms
 * (AC-ROM-13).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder } from "@/features/shell";
import { ShellParam } from "@/features/shell/client";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = isFeatureEnabled("rooms")
  ? { title: "Host screen", robots: { index: false } }
  : { robots: { index: false } };

export default function HostRoomRoute() {
  if (!isFeatureEnabled("rooms")) notFound();
  return (
    <PagePlaceholder title="Host screen">
      <ShellParam source="/host/:roomId" />
    </PagePlaceholder>
  );
}
