/**
 * The not-found page where a route group's layout already drew the frame
 * (DESIGN §12.42; RITE round 1, R1-02): a `notFound()` in the `(tabs)`,
 * `(info)`, `(landing)` or `(host)` group, such as a Beta route with its
 * flag off, renders inside that layout's `<main>`, so only the words go
 * here; a second frame would put a header and a `<main>` inside the first.
 * The group's `not-found.tsx` re-exports it. The page keeps the route's own
 * metadata (a Beta route's carries no title, AC-ROM-13).
 */
import { NotFoundContent } from "../not-found";

export default function NotFoundInFrameRoute() {
  return <NotFoundContent />;
}
