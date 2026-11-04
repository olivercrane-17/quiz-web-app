/**
 * The root layout (ARCHITECTURE §10.3): `<html>` with the inline boot
 * script first in `<head>`, so the stored theme, motion, readable-text and
 * contrast settings are on `<html>` before first paint (hence
 * `suppressHydrationWarning`), and the two font families. No context
 * providers: islands reach settings, identity and the backend through
 * module singletons, which keeps the shared bundle small. The skip link
 * and the live regions come with each route group's layout, first and
 * last in its frame; the live regions empty when the address changes.
 */
import type { Metadata, Viewport } from "next";

import {
  BootScript,
  DisplaySettingsSync,
  ROOT_METADATA,
  ROOT_VIEWPORT,
  RouteChangeEffects,
} from "@/features/shell/routes/root-layout";
import { getSiteUrl, isMockBackend } from "@/lib/env";

import { FONT_VARIABLES } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  ...ROOT_METADATA,
};

export const viewport: Viewport = ROOT_VIEWPORT;

/**
 * The App Shell of every route stays static (ARCHITECTURE §10.2 rule 5).
 * The route-group layouts set stricter levels; this covers pages outside
 * a group (not-found, /offline).
 */
export const ensureStatic = "shell";

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Mock builds read a test's device namespace too; fixed at build time.
  const devices = isMockBackend();
  return (
    <html lang="en" className={FONT_VARIABLES} suppressHydrationWarning>
      <head>
        <BootScript devices={devices} />
      </head>
      <body>
        <DisplaySettingsSync devices={devices} />
        <RouteChangeEffects />
        {children}
      </body>
    </html>
  );
}
