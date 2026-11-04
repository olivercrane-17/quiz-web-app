/**
 * What the root layout needs from the shell (ARCHITECTURE §10.3): the
 * metadata and viewport every page starts from, the inline boot script for
 * `<head>`, and the component that keeps the display attributes current.
 * `src/app/layout.tsx` renders `<html>` with them; it may import only
 * route modules, so the shell's pieces come in through this one.
 */
import type { Metadata, Viewport } from "next";

import { InlineScript } from "@/ui/inline-script";
import { THEME_COLORS, bootScript } from "@/platform/settings/boot";

import { SHELL_COPY } from "../copy";

export { DisplaySettingsSync } from "../display-settings-sync";

/** Titles read "Daily No. 42 · Knewt" (DESIGN §11); Today's is the name alone. */
export const ROOT_METADATA: Metadata = {
  title: {
    default: SHELL_COPY.brand,
    template: `%s · ${SHELL_COPY.brand}`,
  },
  description: SHELL_COPY.description,
  applicationName: SHELL_COPY.brand,
  // Scores and counts such as "4,812" must never turn into phone links.
  formatDetection: { telephone: false, address: false, email: false },
};

export const ROOT_VIEWPORT: Viewport = {
  // The browser's chrome takes the page colour of each theme (DESIGN
  // §12.43); a forced theme repoints both (applyDisplaySettings).
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
