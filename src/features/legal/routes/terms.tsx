/**
 * Route module (ARCHITECTURE §10.1): `/terms`, one of the seven trust
 * pages (PRD §3.14, DESIGN §12.40), fully static in the (info) group's
 * reading layout, and indexable. Its words are in
 * `../documents/terms.ts`. `src/app/(info)/terms/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { SHELL_COPY } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";
import { indexable } from "@/lib/metadata";

import { termsDocument } from "../documents/terms";
import { LegalPage } from "../ui/legal-page";

export const metadata: Metadata = indexable(SHELL_COPY.legal.terms, "/terms");

export default function TermsRoute() {
  return <LegalPage document={termsDocument(isFeatureEnabled)} />;
}
