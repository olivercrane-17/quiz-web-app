/**
 * Not found (ARCHITECTURE §10.1, DESIGN §12.42): every unmatched URL and
 * every `notFound()`. The shell owns the page, which FIX-DS built to
 * DESIGN §12.42 (the words, the one smile, Go to Today and Practice, inside
 * the tab frame); this file re-exports it. LGL-1 keeps it as it is and
 * checks it beside every indexable route: a 404, one h1 and a title of its
 * own, "Page not found · Knewt" (e2e/legal/sitemap.spec.ts). Next adds the
 * noindex itself, and the sitemap never lists it.
 */
export { default, metadata } from "@/features/shell/routes/not-found";
