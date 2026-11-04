/**
 * Route module (ARCHITECTURE §10.1): shared quiz play (PRD §3.9.5, DESIGN
 * §12.38): the practice question flow, sealed, with Report on every reveal.
 * Served at /q/:code/play, which next.config.ts rewrites onto the static
 * page /shell/quiz-play; the address bar keeps the original path.
 *
 * In the (play) group, so it renders <PlayFrame> (the play header, then
 * <main>) around its screen.
 *
 * A stub until EDT-3, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/q/:code/play") (@/features/shell/client), never from
 * useParams or a one-off read of location.pathname: Next reuses this one
 * shell for every code, and keeps it mounted while hidden, so the param
 * changes under a mounted island (§10.2 rule 8). Reset per-code state when
 * it changes, or key the island by it. At /shell/quiz-play itself the param
 * is null, and it shows the invalid-link copy. The stub's <ShellParam>
 * marker goes with it. Beta: with the editor flag off it is the not-found
 * page, and its metadata is the not-found page's own (`NOT_FOUND_METADATA`,
 * R1-02), which names no Beta feature.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  NOT_FOUND_METADATA,
  PagePlaceholder,
  PlayFrame,
  SHELL_COPY,
} from "@/features/shell";
import { ShellParam } from "@/features/shell/client";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = isFeatureEnabled("editor")
  ? { title: "Shared quiz play", robots: { index: false } }
  : NOT_FOUND_METADATA;

export default function SharedQuizPlayRoute() {
  if (!isFeatureEnabled("editor")) notFound();
  return (
    <PlayFrame
      header={{ leave: { href: "/", label: SHELL_COPY.leaveToToday } }}
    >
      <PagePlaceholder title="Shared quiz play" className="px-4">
        <ShellParam source="/q/:code/play" />
      </PagePlaceholder>
    </PlayFrame>
  );
}
