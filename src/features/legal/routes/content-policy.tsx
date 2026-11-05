/**
 * Route module (ARCHITECTURE §10.1): `/content-policy`, one of the seven trust
 * pages (PRD §3.14, DESIGN §12.40), fully static in the (info) group's
 * reading layout, and indexable. Its words are in
 * `../documents/content-policy.ts`. `src/app/(info)/content-policy/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { SHELL_COPY } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";
import { indexable } from "@/lib/metadata";

import { contentPolicyDocument } from "../documents/content-policy";
import { LegalPage } from "../ui/legal-page";

export const metadata: Metadata = indexable(
  SHELL_COPY.legal.contentPolicy,
  "/content-policy",
);

export default function ContentPolicyRoute() {
  return <LegalPage document={contentPolicyDocument(isFeatureEnabled)} />;
}
