/**
 * Extension point (ARCHITECTURE §2.3): Today's challenges slot, composed by
 * src/features/home/sections.tsx. It holds the "2 challenges waiting" row,
 * shown only while any are unplayed (PRD §6.1).
 *
 * A stub until CHL-1: it renders nothing. Size: keep this file a small "use
 * client" wrapper that renders null or a fixed-size placeholder and loads
 * its card with dynamic(() => import("./home-card")), because sections.tsx
 * imports it statically into Home's first load (§10.9 item 2). It loads its
 * own data after first paint.
 */
export function ChallengesHomeSlot() {
  return null;
}
