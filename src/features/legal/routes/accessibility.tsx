/**
 * Route module (ARCHITECTURE §10.1): one of the seven trust pages (PRD
 * §3.14, DESIGN §12.40), in the (info) group's reading layout:
 * `/accessibility`. A placeholder until LGL-1 writes its text and keeps the
 * default export and the metadata (RITE round 1, R1-02: every footer link
 * opened a bare 404).
 * `src/app/(info)/accessibility/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { PagePlaceholder, SHELL_COPY } from "@/features/shell";

export const metadata: Metadata = {
  title: SHELL_COPY.legal.accessibility,
  robots: { index: false },
};

export default function AccessibilityRoute() {
  return <PagePlaceholder title={SHELL_COPY.legal.accessibility} />;
}
