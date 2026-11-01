/**
 * Extension point (ARCHITECTURE §2.3): Today's groups slot, composed by
 * src/features/home/sections.tsx. It holds the Group row, "Uni lot · You're
 * 2nd this week" (DESIGN §12.1).
 *
 * A stub until GRP-1: it renders nothing. Size: keep this file a small "use
 * client" wrapper that renders null or a fixed-size placeholder and loads
 * its card with dynamic(() => import("./home-card")), because sections.tsx
 * imports it statically into Home's first load (§10.9 item 2). It loads its
 * own data after first paint.
 */
export function GroupsHomeSlot() {
  return null;
}
