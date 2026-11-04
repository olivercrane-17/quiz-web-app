"use client";

/**
 * Clears what the previous page said from the app's live regions whenever
 * the address changes (RITE round 1, R1-09; DESIGN §6.9, §11). The regions
 * sit at the end of `<body>`, outside every route, so without this a
 * screen reader that reads to the end of Today meets the Daily's "Clue 2 is
 * in. Now worth 3.", and the results page's "Practice done. 7 out of 10."
 * is still there when Play again starts a new run.
 *
 * A layout effect, so it runs in the commit that shows the new page and
 * before that page's own effects, which is where every screen announces
 * as it arrives: those words stay. A toast's words are kept on purpose
 * (`keepOnRouteChange`, src/ui/toast.ts). The root layout renders it once,
 * inside `<Suspense>`, because `usePathname` may suspend while a route
 * with unknown params prerenders (ARCHITECTURE §10.2 rule 2). It renders
 * nothing.
 */
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { clearRouteAnnouncements } from "@/ui/announce";

export function RouteAnnouncements() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (previous.current !== null && previous.current !== pathname) {
      clearRouteAnnouncements();
    }
    previous.current = pathname;
  }, [pathname]);
  return null;
}
