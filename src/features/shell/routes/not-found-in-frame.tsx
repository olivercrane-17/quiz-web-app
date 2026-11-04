/**
 * The not-found page where a route group's layout already drew the frame
 * (DESIGN §12.42; RITE round 1, R1-02): a `notFound()` in the `(tabs)`,
 * `(info)`, `(landing)` or `(host)` group, such as a Beta route with its
 * flag off, renders inside that layout's `<main>`, so only the words go
 * here; a second frame would put a header and a `<main>` inside the first.
 * The group's `not-found.tsx` re-exports it.
 *
 * Its title is not this file's to give: Next titles the page from the
 * module that called `notFound()`, and reads no metadata here. A route
 * module that can call it exports `NOT_FOUND_METADATA` (from
 * `@/features/shell`) for that case, so the page is "Page not found ·
 * Knewt". Until the Beta stubs (the editor, rooms and shared quizzes) do,
 * theirs carry no title and the page shows Today's, "Knewt": a gap, not
 * the intent (FIX-DS follow-up for EDT-1, ROM-2, ROM-3 and EDT-3).
 */
import { NotFoundContent } from "../not-found";

export default function NotFoundInFrameRoute() {
  return <NotFoundContent />;
}
