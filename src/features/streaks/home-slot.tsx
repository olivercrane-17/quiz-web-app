/**
 * Extension point (ARCHITECTURE §2.3): Today's streaks slot, composed by
 * src/features/home/sections.tsx. It holds the This week card only (DESIGN
 * §12.1), in the right column from 1024 px. The one-time streak notices (a
 * freeze or protection note) sit above Practice, in home-notice.tsx.
 *
 * A stub until STK-1: it renders nothing. Size: keep this file a small "use
 * client" wrapper that renders null or a fixed-size placeholder and loads
 * its card with dynamic(() => import("./home-card")), because sections.tsx
 * imports it statically into Home's first load (§10.9 item 2). It loads its
 * own data after first paint.
 */
export function StreaksHomeSlot() {
  return null;
}
