"use client";

/**
 * Makes sure the app's two live regions exist as soon as the page hydrates
 * (ARCHITECTURE §10.3), so the first announcement is heard. The regions
 * themselves live at the end of `<body>`, outside every route (see
 * `announce.ts`), so rendering this in several layouts, or in the root
 * layout as well, still makes one pair. It renders nothing.
 */
import { useEffect } from "react";

import { ensureLiveRegions } from "./announce";

export function LiveRegions() {
  useEffect(() => {
    ensureLiveRegions();
  }, []);
  return null;
}
