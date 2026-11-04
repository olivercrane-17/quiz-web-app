/**
 * Route module (ARCHITECTURE §10.1): Me, `/me` (PRD §3.4.3, DESIGN §12.23),
 * in the (tabs) group. A placeholder until STA-1, which keeps the default
 * export and the metadata (RITE round 1, R1-02: the Me tab opened a bare
 * 404). `src/app/(tabs)/me/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { PagePlaceholder, SHELL_COPY } from "@/features/shell";

export const metadata: Metadata = {
  title: SHELL_COPY.tabs.me,
  robots: { index: false },
};

export default function MeRoute() {
  return <PagePlaceholder title={SHELL_COPY.tabs.me} />;
}
