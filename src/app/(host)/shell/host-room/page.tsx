/**
 * The static shell for /host/:roomId (ARCHITECTURE §10.1): next.config.ts
 * rewrites that pattern onto this page. It re-exports the route module.
 */
export { default, metadata } from "@/features/rooms/host/routes/host-room";
