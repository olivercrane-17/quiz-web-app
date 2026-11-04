/**
 * Route module (ARCHITECTURE §10.1): Settings, `/settings` (PRD §3.12,
 * DESIGN §12.28), in the (tabs) group. A placeholder until SET-1, which
 * keeps the default export and the metadata (RITE round 1, R1-02: the top
 * bar's gear opened a bare 404). `src/app/(tabs)/settings/page.tsx`
 * re-exports it.
 */
import type { Metadata } from "next";

import { PagePlaceholder, SHELL_COPY } from "@/features/shell";

export const metadata: Metadata = {
  title: SHELL_COPY.settings,
  robots: { index: false },
};

export default function SettingsRoute() {
  return <PagePlaceholder title={SHELL_COPY.settings} />;
}
