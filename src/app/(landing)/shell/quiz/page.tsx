/**
 * The static shell for /q/:code (ARCHITECTURE §10.1): next.config.ts
 * rewrites that pattern onto this page. It re-exports the route module.
 */
export { default, metadata } from "@/features/shared-quiz/routes/quiz";
