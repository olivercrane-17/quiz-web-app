/**
 * The not-found page (DESIGN §1.4, §12.42; RITE round 1, R1-02): "We
 * couldn't find that page." with the one smile, Go to Today as the primary
 * and Practice beside it, inside the tab pages' frame, so the top bar and
 * the tab bar are there and a dead link never strands anyone (an installed
 * app has no Back button). The newt "looking for something" stands beside
 * it, at the 64 px detail level, decorative (DESIGN §1.6).
 *
 * Next renders `src/app/not-found.tsx` (which re-exports this module) for
 * every unmatched URL and every `notFound()`, such as a Beta route with
 * its flag off, inside the root layout only, so this module brings the
 * frame itself. Static, with its own title ("Page not found · Knewt"); Next
 * adds the noindex meta to every 404 response by itself.
 */
import type { Metadata, Route } from "next";
import Link from "next/link";

import { buttonClasses } from "@/ui/button-classes";
import { NewtMark } from "@/ui/newt-mark";

import { SHELL_COPY } from "../copy";
import { TabsFrame } from "./tabs-layout";

const COPY = SHELL_COPY.notFound;

export const metadata: Metadata = {
  title: COPY.title,
  robots: { index: false },
};

export default function NotFoundRoute() {
  return (
    <TabsFrame>
      <div data-not-found="" className="flex flex-col items-start gap-4 py-6">
        <NewtMark size={64} />
        <h1 className="font-display text-display-2">{COPY.heading}</h1>
        <p className="text-body text-ink-2">{COPY.smile}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className={buttonClasses({ variant: "primary" })}>
            {COPY.goToToday}
          </Link>
          <Link
            // The hub is FIX-PRA's greybox until PRA-2 (typed once it merges);
            // no prefetch from a dead end.
            href={"/practice" as Route}
            prefetch={false}
            className={buttonClasses({ variant: "secondary" })}
          >
            {COPY.practice}
          </Link>
        </div>
      </div>
    </TabsFrame>
  );
}
