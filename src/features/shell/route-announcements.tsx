"use client";

/**
 * What the shell does whenever the address changes (RITE round 1, R1-09;
 * DESIGN §6.9, §11):
 *
 * - It clears what the previous page said from the app's live regions.
 *   The regions sit at the end of `<body>`, outside every route, so without
 *   this a screen reader that reads to the end of Today meets the Daily's
 *   "Clue 2 is in. Now worth 3.", and the results page's "Practice done. 7
 *   out of 10." is still there when Play again starts a new run. A toast's
 *   words are kept on purpose (`keepOnRouteChange`, src/ui/toast.ts).
 * - It catches focus that the old page took with it. Next keeps a visited
 *   route in the document, hidden with `display: none`, and leaves focus
 *   alone, so a link that opens a page in another route group (Today's
 *   footer link to Privacy, the trust page's tabs back) hides itself while
 *   it has focus, and focus falls to `<body>`: the next Tab would leave the
 *   page. The page's `<main>` (focusable at -1, the skip link's target)
 *   takes it instead, without scrolling, so the next Tab reaches the new
 *   page's first control. Focus that is still on something shown is never
 *   moved (R1-14), and a page that moves focus itself, to a question's
 *   heading say, does so in its own effects, which run after this one.
 * - It tells a toast that outlived the old page to rise above the new
 *   page's bar (the tab bar, or none), not the old page's dock.
 *
 * A layout effect, so it runs in the commit that shows the new page and
 * before that page's own effects, which is where every screen announces
 * as it arrives: those words stay. The root layout renders it once,
 * inside `<Suspense>`, because `usePathname` may suspend while a route
 * with unknown params prerenders (ARCHITECTURE §10.2 rule 2). It renders
 * nothing.
 */
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { clearRouteAnnouncements } from "@/ui/announce";
import { signalRouteChange } from "@/ui/route-change";
import { firstShown, isShown } from "@/ui/shown";

/**
 * Moves focus to the shown page's `<main>` when it is on nothing, or on
 * an element the route change just hid. Any `<main>`, not `main#main`: a
 * route shown again gets its id back from a ref, which may attach after
 * this runs, and only one route is shown at a time.
 */
function catchDroppedFocus(): void {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active !== document.body &&
    isShown(active)
  ) {
    return;
  }
  firstShown<HTMLElement>("main")?.focus({ preventScroll: true });
}

export function RouteAnnouncements() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (previous.current !== null && previous.current !== pathname) {
      clearRouteAnnouncements();
      catchDroppedFocus();
      signalRouteChange();
    }
    previous.current = pathname;
  }, [pathname]);
  return null;
}
