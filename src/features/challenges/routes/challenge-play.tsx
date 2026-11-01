/**
 * Route module (ARCHITECTURE §10.1): challenge play (PRD §3.6, DESIGN
 * §12.14): a sealed run, finishing on the stop screen for ranked or
 * repairing runs and on the result page otherwise. Served at /c/:code/play,
 * which next.config.ts rewrites onto the static page /shell/challenge-play;
 * the address bar keeps the original path.
 *
 * In the (play) group, so it renders <PlayFrame> (the play header, then
 * <main>) around its screen.
 *
 * A stub until CHL-1, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/c/:code/play") (@/features/shell/client), never from
 * useParams or a one-off read of location.pathname: Next reuses this one
 * shell for every code, and keeps it mounted while hidden, so the param
 * changes under a mounted island (§10.2 rule 8). Reset per-code state when
 * it changes, or key the island by it. At /shell/challenge-play itself the
 * param is null, and it shows the invalid-link copy. The stub's
 * <ShellParam> marker goes with it.
 */
import type { Metadata } from "next";

import { PagePlaceholder, PlayFrame, SHELL_COPY } from "@/features/shell";
import { ShellParam } from "@/features/shell/client";

export const metadata: Metadata = {
  title: "Challenge play",
  robots: { index: false },
};

export default function ChallengePlayRoute() {
  return (
    <PlayFrame
      header={{ leave: { href: "/", label: SHELL_COPY.leaveToToday } }}
    >
      <PagePlaceholder title="Challenge play" className="px-4">
        <ShellParam source="/c/:code/play" />
      </PagePlaceholder>
    </PlayFrame>
  );
}
