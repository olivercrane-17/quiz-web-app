"use client";

/**
 * Quick play on Today and on /practice (PRD §3.3.1, AC-PRA-01): one tap
 * starts a Mixed category, Mixed difficulty run at once. It is a link to
 * /practice/run, so it works before hydration and prefetches the run's
 * shell, and a plain click first leaves the Quick play request in session
 * storage, so the run screen starts a new run.
 *
 * While a run is open it says so and carries that run on instead: "Continue
 * practice · 3 of 10", and a click leaves no request, so the run screen
 * resumes it (R1-36: Quick play used to resume an old run silently). The
 * label is the server's ("Quick play") until the open run is known, after
 * first paint, so hydration never differs. The label wraps inside the
 * button: a button doesn't (`whitespace-nowrap`), and at 200% text or with
 * text spacing "Continue practice · 3 of 10" is wider than a phone, which
 * pushed Today's tab bar off the screen (DESIGN §11 Reflow).
 *
 * Size: one of Home's eager islands, with a 1 kB gzipped target (§10.9 item
 * 2). The label and the class names come from the server component around
 * it, and the open run's label from a chunk loaded after first paint
 * (`./open-run.ts`), so this one holds little more than the click handler.
 */
import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

import { QUICK_PLAY_INTENT, writePracticeIntent } from "./intent";

export function QuickPlayLink({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  /** The open run's label; null while none is open, or not known yet. */
  const [resume, setResume] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // Runs again whenever the page shows again: a run may have opened or
    // finished meanwhile.
    void import("./open-run")
      .then(({ openRunLabel }) => openRunLabel())
      .then((label) => {
        if (live) setResume(label);
      })
      .catch(() => {
        // Without its chunk the link stays Quick play, which still works.
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Link
      href="/practice/run"
      className={className}
      data-practice-open-run={resume === null ? undefined : ""}
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
        // An open run carries on, as the label says.
        if (resume === null) writePracticeIntent(QUICK_PLAY_INTENT);
      }}
    >
      <span className="min-w-0 text-center whitespace-normal">
        {resume ?? children}
      </span>
    </Link>
  );
}
