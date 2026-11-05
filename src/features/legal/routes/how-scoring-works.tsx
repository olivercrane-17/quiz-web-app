/**
 * Route module (ARCHITECTURE §10.1): `/how-scoring-works`, one of the
 * seven trust pages (PRD §3.14, DESIGN §12.40), fully static in the (info)
 * group's reading layout, and indexable. Its first section is the Daily's
 * own How to play text (PRD §3.1.3), from `@/features/daily` (a server
 * component, so nothing reaches the client), with its five parts one level
 * under the section's heading; the rest is in
 * `../documents/how-scoring-works.ts`. The Daily's How to play sheet links
 * here. `src/app/(info)/how-scoring-works/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { HowToPlayText } from "@/features/daily";
import { SHELL_COPY } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";
import { indexable } from "@/lib/metadata";

import { howScoringWorksDocument } from "../documents/how-scoring-works";
import { LegalPage } from "../ui/legal-page";

export const metadata: Metadata = indexable(
  SHELL_COPY.legal.howScoringWorks,
  "/how-scoring-works",
);

export default function HowScoringWorksRoute() {
  return (
    <LegalPage
      document={howScoringWorksDocument(isFeatureEnabled)}
      slots={{ "how-to-play": <HowToPlayText headingLevel={3} /> }}
    />
  );
}
