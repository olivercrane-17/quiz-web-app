/**
 * Today's title (RITE rounds 2 and 3, R2-29 and R3-08): "Today · Knewt"
 * through the root template, so the route announcer says where a screen
 * reader has landed, as every other page's title does, instead of the
 * bare name. The link preview keeps the root's "Knewt": a shared link to
 * `/` names the game, not the tab. `src/app/(tabs)/page.tsx` exports it.
 */
import type { Metadata } from "next";

import { SHELL_CLIENT_COPY } from "../client-copy";

export const TODAY_METADATA: Metadata = {
  title: SHELL_CLIENT_COPY.tabs.today,
};
