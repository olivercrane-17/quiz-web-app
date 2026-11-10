"use client";

/**
 * Whether the route this component belongs to is the one on screen. Next
 * keeps up to three visited routes in the document, hidden with
 * `display: none` inside React's `<Activity>`, and runs their effects'
 * cleanups as it hides them (node_modules/next/dist/docs/01-app/02-guides/
 * preserving-ui-state.md). A layout effect's cleanup runs before the
 * route is hidden, so a component can drop what must not linger in a
 * hidden page, and its setup runs again when the route shows.
 *
 * True on the server and in the first render, so nothing is missing from
 * the HTML or before hydration.
 */
import { useLayoutEffect, useState } from "react";

export function useRouteShown(): boolean {
  const [shown, setShown] = useState(true);
  useLayoutEffect(() => {
    // Shown again (Leave, then Continue): an update set in a layout effect
    // is rendered synchronously, in the same commit as the reveal and
    // before the browser paints, so the route never paints without it. A
    // microtask would not do: its update renders in a later task, after a
    // frame has painted. On the first mount it is already true and changes
    // nothing.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- must land before paint (see above)
    setShown(true);
    return () => {
      setShown(false);
    };
  }, []);
  return shown;
}
