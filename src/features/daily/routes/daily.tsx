/**
 * Route module (ARCHITECTURE §10.1): `/daily`, today's Daily. A prerendered
 * shell; the island starts or resumes today's attempt on mount (PRD §3.1.3,
 * ARCHITECTURE §1.4 item 11). In the (play) group, so the screen renders
 * <PlayFrame>. `src/app/(play)/daily/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { DAILY_COPY } from "../copy";
import { DailyScreen } from "../screen/daily-screen";

export const metadata: Metadata = {
  title: DAILY_COPY.metadata.daily,
  robots: { index: false },
};

export default function DailyRoute() {
  return <DailyScreen />;
}
