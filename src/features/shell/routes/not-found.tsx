/**
 * The not-found page for an address no route matches (DESIGN §12.42; RITE
 * round 1, R1-02), inside the tab pages' frame, so the top bar and the tab
 * bar are there and a dead link never strands anyone (an installed app has
 * no Back button). Next renders `src/app/not-found.tsx`, which re-exports
 * this module, inside the root layout alone, so it brings the frame
 * itself. A `notFound()` inside a route group renders inside that group's
 * layout instead, through the group's own not-found file
 * (`./not-found-in-frame.tsx`, `./not-found-in-play.tsx`).
 *
 * Next prerenders this page once and serves it at every unknown address,
 * `/practice` among them until that page exists, so its tab bar marks no
 * tab: one it marked at `/practice` would not match the prerender. Static,
 * with its own title ("Page not found · Knewt"); Next adds the noindex
 * meta to every 404 response by itself.
 */
import type { Metadata } from "next";

import { SHELL_COPY } from "../copy";
import { NotFoundContent } from "../not-found";
import { TabsFrame } from "./tabs-layout";

export const metadata: Metadata = {
  title: SHELL_COPY.notFound.title,
  robots: { index: false },
};

export default function NotFoundRoute() {
  return (
    <TabsFrame markTab={false}>
      <NotFoundContent />
    </TabsFrame>
  );
}
