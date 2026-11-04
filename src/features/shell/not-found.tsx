/**
 * What the not-found page says (DESIGN §1.4, §12.42; RITE round 1, R1-02):
 * "We couldn't find that page." with the one smile, Go to Today as the
 * primary and Practice beside it, and the newt "looking for something"
 * above, at the 64 px detail level, decorative (DESIGN §1.6). The route
 * modules in `./routes/` put it in a frame, or in the frame a route
 * group's layout already drew.
 */
import type { Route } from "next";
import Link from "next/link";

import { buttonClasses } from "@/ui/button-classes";
import { NewtMark } from "@/ui/newt-mark";

import { SHELL_COPY } from "./copy";

const COPY = SHELL_COPY.notFound;

export function NotFoundContent() {
  return (
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
  );
}
