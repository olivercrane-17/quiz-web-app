/**
 * Route module (ARCHITECTURE §10.1): the phone in a room (PRD §3.8.2, DESIGN
 * §12.33): the lobby, every phase, and the removed, ended, full, locked and
 * reconnecting states. Served at /room/:roomId, which next.config.ts
 * rewrites onto the static page /shell/room; the address bar keeps the
 * original path.
 *
 * In the (play) group, so it renders <PlayFrame> (the play header, then
 * <main>) around its screen.
 *
 * A stub until ROM-3, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/room/:roomId") (@/features/shell/client), never from
 * useParams or a one-off read of location.pathname: Next reuses this one
 * shell for every room, and keeps it mounted while hidden, so the param
 * changes under a mounted island (§10.2 rule 8). Reset per-room state when
 * it changes, or key the island by it. At /shell/room itself the param is
 * null, and it shows the invalid-link copy. The stub's <ShellParam> marker
 * goes with it. Beta: with the rooms flag off it is the not-found page, and
 * its metadata carries no title, so no HTML mentions rooms (AC-ROM-13).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder, PlayFrame, SHELL_COPY } from "@/features/shell";
import { ShellParam } from "@/features/shell/client";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = isFeatureEnabled("rooms")
  ? { title: "Room", robots: { index: false } }
  : { robots: { index: false } };

export default function RoomPhoneRoute() {
  if (!isFeatureEnabled("rooms")) notFound();
  return (
    <PlayFrame
      header={{ leave: { href: "/", label: SHELL_COPY.leaveToToday } }}
    >
      <PagePlaceholder title="Room" className="px-4">
        <ShellParam source="/room/:roomId" />
      </PagePlaceholder>
    </PlayFrame>
  );
}
