/**
 * Route module (ARCHITECTURE §10.1): a practice round, /practice/run, in the
 * (play) group. A prerendered shell whose island plays the run from packs
 * on the device; the category names come from here as props, built at
 * build time. `src/app/(play)/practice/run/page.tsx` re-exports it.
 */
import type { Metadata } from "next";

import { getCategories } from "@/content/loaders/categories";

import { practiceCategoryLabels } from "../categories";
import { PRACTICE_COPY } from "../copy";
import { PracticeRunScreen } from "../run-screen";

export const metadata: Metadata = {
  title: PRACTICE_COPY.meta.run,
  robots: { index: false },
};

export default function PracticeRunRoute() {
  return (
    <PracticeRunScreen categories={practiceCategoryLabels(getCategories())} />
  );
}
