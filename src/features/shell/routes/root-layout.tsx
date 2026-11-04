/**
 * What the root layout needs from the shell (ARCHITECTURE §10.3): the
 * metadata and viewport every page starts from, the inline boot script for
 * `<head>`, the component that keeps the display attributes current, and
 * the one that clears the live regions when the address changes.
 * `src/app/layout.tsx` renders `<html>` with them; it may import only
 * route modules, so the shell's pieces come in through this one.
 */
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { InlineScript } from "@/ui/inline-script";
import { THEME_COLORS, bootScript } from "@/platform/settings/boot";

import { SHELL_COPY } from "../copy";
import { RouteAnnouncements } from "../route-announcements";

export { DisplaySettingsSync } from "../display-settings-sync";

/**
 * Every page's title says Knewt (DESIGN §11; RITE round 1, R1-20): "Daily
 * No. 42 · Knewt", and Today's is the name alone. A link preview names it
 * too: the site name, title and description of the Open Graph and card
 * tags, which every page inherits until it sets its own (SHR-2 gives the
 * share landing its image).
 */
export const ROOT_METADATA: Metadata = {
  title: {
    default: SHELL_COPY.brand,
    template: `%s · ${SHELL_COPY.brand}`,
  },
  description: SHELL_COPY.description,
  applicationName: SHELL_COPY.brand,
  openGraph: {
    type: "website",
    siteName: SHELL_COPY.brand,
    title: SHELL_COPY.brand,
    description: SHELL_COPY.description,
  },
  twitter: {
    card: "summary",
    title: SHELL_COPY.brand,
    description: SHELL_COPY.description,
  },
  // Scores and counts such as "4,812" must never turn into phone links.
  formatDetection: { telephone: false, address: false, email: false },
};

export const ROOT_VIEWPORT: Viewport = {
  // The browser's chrome takes the page colour of each theme (DESIGN
  // §12.43); a chosen theme switches their media (the boot script, then
  // applyDisplaySettings), never their colours.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  // The keyboard resizes the layout in Chromium, so the Mystery's field
  // and the Encore's Lock in stay above it (DESIGN §10.3).
  interactiveWidget: "resizes-content",
};

/** The display settings applied before first paint; goes first in `<head>`. */
export function BootScript({ devices }: { devices: boolean }) {
  return <InlineScript html={bootScript({ devices })} />;
}

/**
 * Clears the previous page's messages from the live regions on every
 * change of address (R1-09). Its hook reads the URL, so it sits inside
 * `<Suspense>` (ARCHITECTURE §10.2 rule 2); it renders nothing.
 */
export function RouteChangeEffects() {
  return (
    <Suspense fallback={null}>
      <RouteAnnouncements />
    </Suspense>
  );
}
