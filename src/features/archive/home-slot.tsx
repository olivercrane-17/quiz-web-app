/**
 * Extension point (ARCHITECTURE §2.3): Today's archive slot, composed by
 * src/features/home/sections.tsx. It holds the streak repair card above
 * Practice (DESIGN §12.1), record first, with "Repair now" and "Not now". It
 * is hidden for the 13 to 17 band (AC-AGE-02). It is the first of Today's
 * notices: while it renders, the streak and restore notices stay hidden,
 * since only one card shows above Practice at a time.
 *
 * A stub until ARC-1: it renders nothing. Size: keep this file a small "use
 * client" wrapper that renders null or a fixed-size placeholder and loads
 * its card with dynamic(() => import("./home-card")), because sections.tsx
 * imports it statically into Home's first load (§10.9 item 2). It loads its
 * own data after first paint.
 */
export function ArchiveHomeSlot() {
  return null;
}
