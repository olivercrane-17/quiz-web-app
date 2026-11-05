/**
 * `/sitemap.xml` (ARCHITECTURE §10.1, PRD §6.2 "Indexing"): the indexable
 * routes and nothing else: Today, the practice hub, the category pages
 * once `category_pages` is on, and the seven trust pages with their
 * "Last updated" dates. Every other route is `noindex` (`@/lib/metadata`),
 * so no per-user address (`/c/`, `/g/`, `/q/`, a claim token) is ever
 * listed (AC-UGS-02). Absolute URLs from the build's site URL; prerendered
 * like the pages, since nothing here reads the request.
 * `src/app/sitemap.ts` re-exports it.
 */
import type { MetadataRoute } from "next";

import { CATEGORIES } from "@/content/generated/categories";
import { getSiteUrl, isFeatureEnabled } from "@/lib/env";

import { LEGAL_PATHS, type LegalPath } from "../document";
import { LEGAL_DOCUMENTS } from "../documents";

/** The indexable paths besides the trust pages, in the order listed. */
export function indexablePaths(
  flags: (flag: "category_pages") => boolean,
): string[] {
  return [
    "/",
    "/practice",
    ...(flags("category_pages")
      ? CATEGORIES.map((category) => `/categories/${category.slug}`)
      : []),
  ];
}

export function buildSitemap(
  siteUrl: string,
  flags: typeof isFeatureEnabled,
): MetadataRoute.Sitemap {
  const legal = LEGAL_PATHS.map((path: LegalPath) => ({
    url: `${siteUrl}${path}`,
    lastModified: LEGAL_DOCUMENTS[path](flags).updated,
  }));
  return [
    ...indexablePaths(flags).map((path) => ({ url: `${siteUrl}${path}` })),
    ...legal,
  ];
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(getSiteUrl(), isFeatureEnabled);
}
