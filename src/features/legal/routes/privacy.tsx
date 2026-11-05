/**
 * Route module (ARCHITECTURE §10.1): `/privacy`, one of the seven trust
 * pages (PRD §3.14, DESIGN §12.40), fully static in the (info) group's
 * reading layout, and indexable. Its words are in
 * `../documents/privacy.ts`. `src/app/(info)/privacy/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { SHELL_COPY } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";
import { indexable } from "@/lib/metadata";

import { privacyDocument } from "../documents/privacy";
import { LegalPage } from "../ui/legal-page";

export const metadata: Metadata = indexable(
  SHELL_COPY.legal.privacy,
  "/privacy",
);

export default function PrivacyRoute() {
  return <LegalPage document={privacyDocument(isFeatureEnabled)} />;
}
