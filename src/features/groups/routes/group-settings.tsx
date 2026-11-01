/**
 * Route module (ARCHITECTURE §10.1): Group settings (PRD §3.7.1, DESIGN
 * §12.21): nickname, leave, and the admin tools. Served at
 * /g/:groupId/settings, which next.config.ts rewrites onto the static page
 * /shell/group-settings; the address bar keeps the original path.
 *
 * A stub until GRP-1, which keeps the default export and the metadata. Its
 * island reads the param from location.pathname in an effect, never through
 * useParams (§10.2 rule 8); at /shell/group-settings itself there is no
 * param, and it shows the invalid-link copy.
 */
import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/shell";

export const metadata: Metadata = {
  title: "Group settings",
  robots: { index: false },
};

export default function GroupSettingsRoute() {
  return <PagePlaceholder title="Group settings" />;
}
