/**
 * Extension point (ARCHITECTURE §2.3): Today's rooms slot, composed by
 * src/features/home/sections.tsx. It holds the Beta "Host a quiz night" row
 * below Practice (PRD §6.1). Nothing may mention rooms while the flag is off
 * (AC-ROM-13). Its owner checks isFeatureEnabled("rooms") and renders
 * nothing while the flag is off.
 *
 * A stub until ROM-2: it renders nothing. Size: keep this file a small "use
 * client" wrapper that renders null or a fixed-size placeholder and loads
 * its card with dynamic(() => import("./home-card")), because sections.tsx
 * imports it statically into Home's first load (§10.9 item 2). Check
 * isFeatureEnabled("rooms") before that import, so no rooms code loads
 * while the flag is off (the flag object is parsed at run time, so a
 * minifier can't drop the branch). It loads its own data after first paint.
 */
export function RoomsHomeSlot() {
  return null;
}
