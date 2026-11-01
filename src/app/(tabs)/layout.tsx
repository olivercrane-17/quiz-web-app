/**
 * The (tabs) route group (ARCHITECTURE §2.1): the top bar and the four-tab
 * bar. The shell feature owns the markup; this file re-exports it.
 */
export { default } from "@/features/shell/routes/tabs-layout";

/**
 * Every route in the group must render completely at build time
 * (ARCHITECTURE §10.2 rule 5, D1). 'navigation' is the one level Next
 * validates: `next dev` and `next build` fail on runtime data (cookies(),
 * headers()), uncached data or a short-lived cache anywhere in the route,
 * even inside <Suspense>, and on a dynamic segment without
 * generateStaticParams (/categories/[slug] lists its 12 slugs). Set on
 * each group's layout because every page lives in a group; it stays valid
 * if DS-1 puts the weaker 'shell' on the root layout.
 */
export const ensureStatic = "navigation";
