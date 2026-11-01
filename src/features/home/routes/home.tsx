/**
 * Today, `/` (DESIGN §12.1, PRD §3.1.7): the dateline and greeting, the home
 * slots, and the footer. A static shell; every slot loads its own data after
 * first paint, so nothing here waits on the backend.
 * `src/app/(tabs)/page.tsx` re-exports it.
 */
import { SiteFooter } from "@/features/shell";

import { HomeIntro } from "../intro";
import { HomeSafePoint } from "../safe-point";
import { HomeSections } from "../sections";

export default function HomeRoute() {
  return (
    <>
      <HomeSafePoint />
      <HomeIntro />
      <HomeSections />
      <SiteFooter />
    </>
  );
}
