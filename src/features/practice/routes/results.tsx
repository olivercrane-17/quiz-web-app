/**
 * Route module (ARCHITECTURE §10.1): practice results, /practice/results,
 * in the (play) group. A prerendered shell whose island reads the run from
 * the device's history. `src/app/(play)/practice/results/page.tsx`
 * re-exports it.
 */
import type { Metadata } from "next";

import { getCategories } from "@/content/loaders/categories";

import { practiceCategoryLabels } from "../categories";
import { PRACTICE_COPY } from "../copy";
import { PracticeResultsScreen } from "../results-screen";

export const metadata: Metadata = {
  title: PRACTICE_COPY.meta.results,
  robots: { index: false },
};

export default function PracticeResultsRoute() {
  return (
    <PracticeResultsScreen
      categories={practiceCategoryLabels(getCategories())}
    />
  );
}
