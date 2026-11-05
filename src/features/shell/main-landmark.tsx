"use client";

/**
 * The page's `<main id="main">`, the skip link's target, which only the
 * route on screen may carry (RITE round 1, R1-09; DESIGN §11).
 *
 * Next keeps up to three visited routes in the document, hidden with
 * `display: none` (React's `<Activity>`), so every frame's `<main>` would
 * otherwise stay there under the same id: two `#main` at once, and an
 * ambiguous skip link. The id is in the prerendered HTML, so the skip link
 * works before hydration; once the page runs, a ref callback takes it off
 * this element when its route is hidden (React detaches the refs of a
 * hidden Activity, as it cleans up its effects) and puts it back when the
 * route shows again. Every shell frame renders one: the tab, info,
 * landing and host layouts, and `PlayFrame`.
 */
import type { ReactNode, Ref } from "react";

import { MAIN_ID } from "./landmarks";

/** Claims the landmark's id while this element is attached and shown. */
const claimMainId: Ref<HTMLElement> = (element) => {
  if (element === null) return;
  element.id = MAIN_ID;
  return () => {
    element.removeAttribute("id");
  };
};

export function MainLandmark({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <main id={MAIN_ID} ref={claimMainId} tabIndex={-1} className={className}>
      {children}
    </main>
  );
}
