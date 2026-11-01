"use client";

/**
 * Quick play on Today (PRD §3.3.1, AC-PRA-01): one tap starts a Mixed
 * category, Mixed difficulty run at once. It is a link to /practice/run, so
 * it works before hydration and prefetches the run's shell, and a plain
 * click first leaves the Quick play request in session storage, so the run
 * screen starts a new run rather than resuming an unfinished one.
 *
 * Size: one of Home's eager islands, with a 1 kB gzipped target (§10.9 item
 * 2). The label and the class names come from the server component around
 * it, so this chunk holds only the click handler.
 */
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { QUICK_PLAY_INTENT, writePracticeIntent } from "./intent";

export function QuickPlayLink({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      href="/practice/run"
      className={className}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        // A new tab or window gets its own session storage; leave this tab's alone.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        writePracticeIntent(QUICK_PLAY_INTENT);
      }}
    >
      {children}
    </Link>
  );
}
