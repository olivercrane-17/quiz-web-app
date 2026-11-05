/**
 * Route module (ARCHITECTURE §10.1): the practice hub, /practice, in the
 * (tabs) group, so the header and the tab bar stay around it. A greybox
 * until PRA-2 (RITE round 1, R1-02: the Practice tab opened a bare 404):
 * the page's title and the Quick play card, which reads "Continue practice
 * · 3 of 10" while a run is open, plus a plain line on what comes next and
 * the way back to Today that every unfinished page offers. PRA-2 replaces
 * it with the category grid, the difficulty control, Start and the mode
 * cards of DESIGN §12.6, keeping the default export and the metadata.
 * `src/app/(tabs)/practice/page.tsx` re-exports it.
 *
 * Fully static: a Server Component whose only client code is the Quick
 * play link's island, which reads the device after first paint.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { SHELL_COPY } from "@/features/shell";
import { buttonClasses } from "@/ui/button-classes";
import { Card } from "@/ui/card";

import { PRACTICE_COPY } from "../copy";
import { QuickPlayLink } from "../quick-play-link";

export const metadata: Metadata = {
  title: PRACTICE_COPY.meta.hub,
  description: PRACTICE_COPY.meta.hubDescription,
};

export default function PracticeHubRoute() {
  return (
    <div data-practice-hub="" className="flex flex-col items-start gap-4 py-2">
      <h1 className="text-2xl font-bold">{PRACTICE_COPY.hub.title}</h1>
      <Card
        data-practice-card="hub"
        className="flex w-full max-w-[720px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-base text-muted-foreground">
          {PRACTICE_COPY.hub.quickPlayLine}
        </p>
        <QuickPlayLink
          className={buttonClasses({
            variant: "primary",
            className: "self-start sm:self-auto",
          })}
        >
          {PRACTICE_COPY.quickPlay}
        </QuickPlayLink>
      </Card>
      <p className="text-base text-muted-foreground">
        {PRACTICE_COPY.hub.later}
      </p>
      <Link href="/" className={buttonClasses({ variant: "text" })}>
        {SHELL_COPY.goToToday}
      </Link>
    </div>
  );
}
