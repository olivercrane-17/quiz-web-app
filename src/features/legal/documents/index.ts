/**
 * The seven pages' documents, by path (PRD §3.14). Each takes the build's
 * feature flags, so Beta and Should features appear on a page only in a
 * build that has them.
 */
import type { FeatureFlag } from "@/config/features";

import type { LegalDocument, LegalPath } from "../document";
import { aboutOurQuestionsDocument } from "./about-our-questions";
import { accessibilityDocument } from "./accessibility";
import { contentPolicyDocument } from "./content-policy";
import { creditsDocument } from "./credits";
import { howScoringWorksDocument } from "./how-scoring-works";
import { privacyDocument } from "./privacy";
import { termsDocument } from "./terms";

export type FlagReader = (flag: FeatureFlag) => boolean;

export const LEGAL_DOCUMENTS: Readonly<
  Record<LegalPath, (flags: FlagReader) => LegalDocument>
> = {
  "/how-scoring-works": howScoringWorksDocument,
  "/about-our-questions": aboutOurQuestionsDocument,
  "/privacy": privacyDocument,
  "/terms": termsDocument,
  "/content-policy": contentPolicyDocument,
  "/accessibility": accessibilityDocument,
  "/credits": creditsDocument,
};
