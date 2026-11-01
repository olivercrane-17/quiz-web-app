/**
 * Route module (ARCHITECTURE §10.1): the shared quiz result (PRD §3.9.5,
 * DESIGN §12.38): the score, every explanation, Share and Play today's
 * Daily. Served at /q/:code/result, which next.config.ts rewrites onto the
 * static page /shell/quiz-result; the address bar keeps the original path.
 *
 * A stub until EDT-3, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/q/:code/result") (@/features/shell/client), never from
 * useParams or a one-off read of location.pathname: Next reuses this one
 * shell for every code, and keeps it mounted while hidden, so the param
 * changes under a mounted island (§10.2 rule 8). Reset per-code state when
 * it changes, or key the island by it. At /shell/quiz-result itself the
 * param is null, and it shows the invalid-link copy. The stub's
 * <ShellParam> marker goes with it. Beta: with the editor flag off it is
 * the not-found page, and its metadata carries no title.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder } from "@/features/shell";
import { ShellParam } from "@/features/shell/client";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = isFeatureEnabled("editor")
  ? { title: "Shared quiz result", robots: { index: false } }
  : { robots: { index: false } };

export default function SharedQuizResultRoute() {
  if (!isFeatureEnabled("editor")) notFound();
  return (
    <PagePlaceholder title="Shared quiz result">
      <ShellParam source="/q/:code/result" />
    </PagePlaceholder>
  );
}
