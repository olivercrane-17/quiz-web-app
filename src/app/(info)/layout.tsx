/**
 * The (info) route group (ARCHITECTURE §2.1): the readable layout for legal
 * and trust pages. The shell feature owns the markup; this file re-exports
 * it.
 */
export { default } from "@/features/shell/routes/info-layout";

/**
 * Every route in the group keeps a static App Shell (ARCHITECTURE §10.2
 * rule 5, D1). Set on each group's layout because every page lives in a
 * group; it agrees with the root layout if DS-1 sets the same value there.
 */
export const ensureStatic = "shell";
