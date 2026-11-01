/**
 * Route module (ARCHITECTURE §10.1): challenge play (PRD §3.6, DESIGN
 * §12.14): a sealed run, finishing on the stop screen for ranked or
 * repairing runs and on the result page otherwise. Served at /c/:code/play,
 * which next.config.ts rewrites onto the static page /shell/challenge-play;
 * the address bar keeps the original path.
 *
 * A stub until CHL-1, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/challenge-play itself there is no
 * param, and it shows the invalid-link copy.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";

export const metadata: Metadata = {
  title: "Challenge play",
  robots: { index: false },
};

export default function ChallengePlayRoute() {
  return <PagePlaceholder title="Challenge play" className="px-4" />;
}
