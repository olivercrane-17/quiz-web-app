/**
 * The static shell for /claim/:token (ARCHITECTURE §10.1): next.config.ts
 * rewrites that pattern onto this page. It re-exports the route module.
 */
export { default, metadata } from "@/features/identity/routes/claim";
