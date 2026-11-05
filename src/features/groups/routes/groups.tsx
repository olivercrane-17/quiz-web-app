/**
 * Route module (ARCHITECTURE §10.1): Your Groups, `/g` (PRD §3.7.2, DESIGN
 * §12.18), in the (tabs) group. A placeholder until GRP-1, which keeps the
 * default export and the metadata (RITE round 1, R1-02: the Groups tab
 * opened a bare 404). `src/app/(tabs)/g/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { PagePlaceholder, SHELL_COPY } from "@/features/shell";

export const metadata: Metadata = {
  title: SHELL_COPY.tabs.groups,
  robots: { index: false },
};

export default function GroupsRoute() {
  return <PagePlaceholder title={SHELL_COPY.tabs.groups} />;
}
