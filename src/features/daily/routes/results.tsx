/**
 * Route module (ARCHITECTURE §10.1): `/daily/[number]/results`, the stop
 * screen. A prerendered shell: the island reads the Daily number with
 * useParams() inside <Suspense> (§10.2 rules 1 and 2), and the fallback is
 * the same frame with a skeleton, so nothing shifts when it resolves.
 * `src/app/(play)/daily/[number]/results/page.tsx` re-exports it.
 */
import type { Metadata } from "next";
import { Suspense } from "react";

import { PlayFrame } from "@/features/shell";

import { DAILY_COPY } from "../copy";
import { StopScreen, StopScreenSkeleton } from "../stop-screen/stop-screen";

export const metadata: Metadata = {
  title: DAILY_COPY.metadata.results,
  robots: { index: false },
};

function Fallback() {
  return (
    <PlayFrame
      header={{ leave: { href: "/", label: DAILY_COPY.stopScreen.close } }}
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-6">
        <h1 className="sr-only">{DAILY_COPY.stopScreen.title}</h1>
        <StopScreenSkeleton />
      </div>
    </PlayFrame>
  );
}

export default function ResultsRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <StopScreen />
    </Suspense>
  );
}
