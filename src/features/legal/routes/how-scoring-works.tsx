/**
 * Route module (ARCHITECTURE §10.1): one of the seven trust pages (PRD
 * §3.14, DESIGN §12.40), in the (info) group's reading layout:
 * `/how-scoring-works`. It carries the Daily's How to play text (PRD
 * §3.1.3), its five parts as `h2`s under the page's `h1`, from the Daily's
 * index (a server component, so nothing reaches the client). LGL-1 adds the
 * rest of the page (Encore bands and "% off", the percentile, the
 * honest-play disclosure, time zones, practice scoring and voids) and keeps
 * the default export and the metadata. The Daily's How to play sheet links
 * here. `src/app/(info)/how-scoring-works/page.tsx` re-exports it.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { HowToPlayText } from "@/features/daily";
import { SHELL_COPY } from "@/features/shell";
import { buttonClasses } from "@/ui/button-classes";

export const metadata: Metadata = {
  title: SHELL_COPY.legal.howScoringWorks,
  robots: { index: false },
};

export default function HowScoringWorksRoute() {
  return (
    <div className="flex flex-col items-start gap-6 py-6">
      <h1 className="font-display text-display-2">
        {SHELL_COPY.legal.howScoringWorks}
      </h1>
      <HowToPlayText headingLevel={2} />
      <Link href="/" className={buttonClasses({ variant: "secondary" })}>
        {SHELL_COPY.goToToday}
      </Link>
    </div>
  );
}
