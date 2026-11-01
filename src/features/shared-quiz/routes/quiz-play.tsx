/**
 * Route module (ARCHITECTURE §10.1): shared quiz play (PRD §3.9.5, DESIGN
 * §12.38): the practice question flow, sealed, with Report on every reveal.
 * Served at /q/:code/play, which next.config.ts rewrites onto the static
 * page /shell/quiz-play; the address bar keeps the original path.
 *
 * A stub until EDT-3, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/quiz-play itself there is no param,
 * and it shows the invalid-link copy. Beta: with the editor flag off it is
 * the not-found page.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = {
  title: "Shared quiz play",
  robots: { index: false },
};

export default function SharedQuizPlayRoute() {
  if (!isFeatureEnabled("editor")) notFound();
  return <PagePlaceholder title="Shared quiz play" className="px-4" />;
}
