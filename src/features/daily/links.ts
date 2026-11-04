/**
 * Where the Daily's links lead. A module of its own, so no screen's chunk
 * carries another's.
 *
 * - Practice (the Daily's fallbacks, PRD §3.0.2, and the stop screen's soft
 *   offer, §3.1.6 item 10): Quick play, which starts a run from a plain
 *   link, until PRA-2 builds the practice hub at /practice in Wave 5.
 * - The archive (Past 7 days, PRD §3.1.7): null while no route serves it,
 *   so Today's card and the stop screen show no link that ends on a bare
 *   404 (RITE round 1, R1-02). ARC-1 sets it to "/archive" with its route,
 *   and `links.test.ts` fails until the two agree.
 */
import type { Route } from "next";

export const PRACTICE_HREF = "/practice/run";

export const ARCHIVE_HREF: Route | null = null;
