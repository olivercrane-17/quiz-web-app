/**
 * Today, `/` (DESIGN §12.1, PRD §3.1.7): the dateline and greeting (with
 * the first-visit line), the home slots, and the footer. A static shell;
 * every slot loads its own data after first paint, so nothing here waits
 * on the backend. A push arrival opens it at the top (`HomeArrival`).
 * `src/app/(tabs)/page.tsx` re-exports it.
 */
import { SiteFooter } from "@/features/shell";
import { isMockBackend } from "@/lib/env";

import { HomeArrival } from "../arrival";
import { HomeIntro } from "../intro";
import { HomeSafePoint } from "../safe-point";
import { HomeSections } from "../sections";

export default function HomeRoute() {
  return (
    <>
      <HomeArrival />
      <HomeSafePoint />
      {/* Mock builds read a test's device namespace too; fixed at build time. */}
      <HomeIntro devices={isMockBackend()} />
      <HomeSections />
      <SiteFooter />
    </>
  );
}
