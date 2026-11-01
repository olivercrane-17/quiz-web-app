/**
 * Extension point (ARCHITECTURE §2.3): Today's streak notice, composed by
 * src/features/home/sections.tsx above Practice. It holds a freeze or
 * protection note, shown once (DESIGN §12.1): "A freeze covered Tuesday."
 *
 * Today shows one notice at a time, first with content wins: the repair
 * card (the archive slot), then this note, then the restore note. A notice
 * with nothing to say renders nothing, and the next one shows.
 *
 * A stub until STK-1: it renders nothing. Size: keep this file a small
 * "use client" wrapper that renders null or a fixed-size placeholder and
 * loads its card with dynamic(() => import("./home-notice-card")), because
 * sections.tsx imports it statically into Home's first load (§10.9 item 2).
 */
export function StreakNotice() {
  return null;
}
