/**
 * Page metadata (ARCHITECTURE §10.1; LGL-1).
 *
 * - **Titles.** A page names itself in a few words ("Privacy", "Groups")
 *   and the root layout's template adds the brand: "Privacy · Knewt"
 *   (R1-20). Titles stay unique per route, because the route announcer
 *   reads them on every navigation (R1-09, WCAG 2.4.2). Today alone keeps
 *   the bare brand.
 * - **Indexing.** Only `/`, `/practice`, `/categories/*` and the legal and
 *   trust pages are for search engines. They take `indexable()`, which
 *   adds the canonical address (path-only; the root layout's
 *   `metadataBase` makes it absolute), and the sitemap lists exactly them.
 *   Every other route module exports its metadata through `noindex()`,
 *   which keeps it out of search results without hiding it from crawlers
 *   (a page robots.txt blocks can't show its noindex, so it could still be
 *   listed from a link).
 * - **Not found.** A 404 needs neither: Next adds noindex to every
 *   not-found response itself (`NOT_FOUND_METADATA` in the shell).
 */
import type { Metadata } from "next";

/** A path on this site, always path-only (PRD §6.2). */
export type SitePath = `/${string}`;

/** What `noindex()` adds: `<meta name="robots" content="noindex">`. */
export const NOINDEX: Readonly<{ index: false }> = Object.freeze({
  index: false,
});

/** The metadata of a page that search engines may list, with its canonical address. */
export function indexable(
  title: string,
  path: SitePath,
  extra: Omit<Metadata, "title" | "robots" | "alternates"> = {},
): Metadata {
  return { ...extra, title, alternates: { canonical: path } };
}

/** The same metadata, kept out of search results. */
export function noindex(metadata: Metadata): Metadata {
  return { ...metadata, robots: { ...NOINDEX } };
}

/** True when the metadata keeps its page out of search results. */
export function isNoindex(metadata: Metadata | undefined): boolean {
  const robots = metadata?.robots;
  if (robots === undefined || robots === null) return false;
  if (typeof robots === "string") return /\bnoindex\b/i.test(robots);
  return robots.index === false;
}

/** The words a metadata title gives a page, before the brand template. */
export function titleText(title: Metadata["title"]): string | null {
  if (title === undefined || title === null) return null;
  if (typeof title === "string") return title;
  if ("absolute" in title && typeof title.absolute === "string") {
    return title.absolute;
  }
  if ("default" in title && typeof title.default === "string") {
    return title.default;
  }
  return null;
}
