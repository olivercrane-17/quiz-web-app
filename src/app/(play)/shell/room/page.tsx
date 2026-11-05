/**
 * The static shell for /room/:roomId (ARCHITECTURE §10.1): next.config.ts
 * rewrites that pattern onto this page. It re-exports the route module.
 */
export { default, metadata } from "@/features/rooms/phone/routes/room";
