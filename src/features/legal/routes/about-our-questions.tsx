/**
 * Route module (ARCHITECTURE §10.1): `/about-our-questions`, one of the seven trust
 * pages (PRD §3.14, DESIGN §12.40), fully static in the (info) group's
 * reading layout, and indexable. Its words are in
 * `../documents/about-our-questions.ts`. `src/app/(info)/about-our-questions/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { SHELL_COPY } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";
import { indexable } from "@/lib/metadata";

import { aboutOurQuestionsDocument } from "../documents/about-our-questions";
import { LegalPage } from "../ui/legal-page";

export const metadata: Metadata = indexable(
  SHELL_COPY.legal.aboutOurQuestions,
  "/about-our-questions",
);

export default function AboutOurQuestionsRoute() {
  return <LegalPage document={aboutOurQuestionsDocument(isFeatureEnabled)} />;
}
