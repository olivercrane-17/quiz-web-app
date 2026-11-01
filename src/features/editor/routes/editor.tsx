/**
 * Route module (ARCHITECTURE §10.1): the quiz editor for a saved quiz (PRD
 * §3.9.1, DESIGN §12.35). Served at /create/:quizId, which next.config.ts
 * rewrites onto the static page /shell/editor; the address bar keeps the
 * original path.
 *
 * A stub until EDT-1, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/editor itself there is no param, and
 * it shows the invalid-link copy. Beta: with the editor flag off it is the
 * not-found page.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder } from "@/features/shell";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = {
  title: "Edit quiz",
  robots: { index: false },
};

export default function EditorRoute() {
  if (!isFeatureEnabled("editor")) notFound();
  return <PagePlaceholder title="Edit quiz" />;
}
