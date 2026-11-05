"use client";

/**
 * The tab links with the active marker, from the URL. `usePathname` may
 * suspend while a route below the layout has unknown params, so the tab
 * bar wraps this in `<Suspense>` with the marker-less list as fallback.
 */
import { usePathname } from "next/navigation";

import { TabList, type TabPlacement } from "./tab-list";
import { tabForPath } from "./tabs";

export function ActiveTabList({ placement }: { placement: TabPlacement }) {
  return <TabList active={tabForPath(usePathname())} placement={placement} />;
}
