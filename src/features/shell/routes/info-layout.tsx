/**
 * The `(info)` layout (ARCHITECTURE §2.1, DESIGN §12.40): a readable
 * layout for the legal and trust pages, a 640 px reading column (560 px of
 * content below 768 px, DESIGN §10.1) in the tab pages' frame. The tab bar
 * stays, as it does everywhere outside play (PRD §6.1), so a page opened
 * from the footer always has a way back, an installed app's included
 * (RITE round 1, R1-02). `src/app/(info)/layout.tsx` re-exports it.
 */
import type { ReactNode } from "react";

import { TabsFrame } from "./tabs-layout";

export default function InfoLayout({ children }: { children: ReactNode }) {
  return <TabsFrame column="reading">{children}</TabsFrame>;
}
