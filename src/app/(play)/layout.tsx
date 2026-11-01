/**
 * The (play) route group (ARCHITECTURE §2.1): focus mode, with Leave,
 * progress and More and no tab bar. The shell feature owns the markup; this
 * file re-exports it.
 */
export { default } from "@/features/shell/routes/play-layout";

/**
 * The group's App Shell stays static (ARCHITECTURE §10.2 rule 5, D1).
 * /daily/[number] and /daily/[number]/results read their params, so the group
 * can't take 'navigation', which would demand every param at build time.
 * 'shell' only keeps the App Shell that a default <Link> prefetches
 * static. It adds no build validation: a cookies() call or an uncached
 * fetch inside <Suspense> would still pass the build, so review keeps
 * those out (§10.2 rule 1). It agrees with the root layout if DS-1 sets
 * the same value there.
 */
export const ensureStatic = "shell";
