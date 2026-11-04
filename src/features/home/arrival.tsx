"use client";

/**
 * Today opens at its top (RITE round 1, R1-35): coming back from the
 * Daily, a practice run or another tab, it used to open about 34 px
 * scrolled, because Next scrolls only when the new page's top is out of
 * view, and the scroll position the last page left behind could put it
 * just inside.
 *
 * So a push or replace arrival (a link, Leave, a tab) scrolls the window
 * to the top, in a layout effect, before the arrival's first paint. Back
 * and Forward keep the scroll the browser restores: Next's `bfcacheId`
 * changes on a push or replace and stays the same on a traversal, and the
 * effect runs again whenever Next shows Today from its hidden routes
 * (React re-creates the effects of a hidden `<Activity>`), so a repeated
 * id means a traversal. The page's own first load is left to the browser
 * too: a fresh load is at the top, and a reload restores where it was. It
 * renders nothing.
 */
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

const noSubscription = () => () => {};
/** True only while React hydrates the prerendered page. */
const hydratingOnTheClient = () => false;
const hydratingOnTheServer = () => true;

export function HomeArrival() {
  const { bfcacheId } = useRouter();
  const hydrating = useSyncExternalStore(
    noSubscription,
    hydratingOnTheClient,
    hydratingOnTheServer,
  );
  // The first render's answer: did this copy of Today come with the page?
  const cameWithThePage = useRef(hydrating);
  const shownFor = useRef<string | null>(null);

  useLayoutEffect(() => {
    const previous = shownFor.current;
    shownFor.current = bfcacheId;
    if (previous === null ? cameWithThePage.current : previous === bfcacheId) {
      return;
    }
    window.scrollTo(0, 0);
  }, [bfcacheId]);

  return null;
}
