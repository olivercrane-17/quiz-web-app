/**
 * Route module (ARCHITECTURE §10.1): the quiz editor for a saved quiz (PRD
 * §3.9.1, DESIGN §12.35). Served at /create/:quizId, which next.config.ts
 * rewrites onto the static page /shell/editor; the address bar keeps the
 * original path.
 *
 * A stub until EDT-1, which keeps the default export and the metadata. Its
 * island sits inside <Suspense> (§10.2 rule 2) and takes the param from
 * usePathParam("/create/:quizId") (@/features/shell/client), never from
 * useParams or a one-off read of location.pathname: Next reuses this one
 * shell for every quiz, and keeps it mounted while hidden, so the param
 * changes under a mounted island (§10.2 rule 8). Reset per-quiz state when
 * it changes, or key the island by it. At /shell/editor itself the param is
 * null, and it shows the invalid-link copy. The stub's <ShellParam> marker
 * goes with it. Beta: with the editor flag off it is the not-found page,
 * and its metadata carries no title.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder } from "@/features/shell";
import { ShellParam } from "@/features/shell/client";
import { isFeatureEnabled } from "@/lib/env";

export const metadata: Metadata = isFeatureEnabled("editor")
  ? { title: "Edit quiz", robots: { index: false } }
  : { robots: { index: false } };

export default function EditorRoute() {
  if (!isFeatureEnabled("editor")) notFound();
  return (
    <PagePlaceholder title="Edit quiz">
      <ShellParam source="/create/:quizId" />
    </PagePlaceholder>
  );
}
