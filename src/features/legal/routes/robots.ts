/**
 * `/robots.txt` (ARCHITECTURE §10.1): crawlers may fetch every page and
 * find the sitemap. Pages that mustn't be listed say so themselves with
 * `noindex` (`@/lib/metadata`); blocking them here would hide that tag
 * and let a linked address be listed anyway. Only addresses with nothing
 * to read are closed: the backup cookie's route handlers and the static
 * shells' own `/shell/...` addresses, which only rewrites reach (§10.1).
 * `src/app/robots.ts` re-exports it.
 */
import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/env";

export function buildRobots(siteUrl: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/shell/"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getSiteUrl());
}
