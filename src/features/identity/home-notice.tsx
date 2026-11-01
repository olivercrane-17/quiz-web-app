/**
 * Extension point (ARCHITECTURE §2.3): Today's restore notice, composed by
 * src/features/home/sections.tsx above Practice. It holds the restore-
 * success note after a sync code, a claim or the backup cookie brought a
 * profile back (DESIGN §12.1): "Welcome back, Plucky Otter. Your 23-day
 * streak is here."
 *
 * Today shows one notice at a time, first with content wins: the repair
 * card (the archive slot), then the streak notice, then this note. A notice
 * with nothing to say renders nothing.
 *
 * A stub until IDN-2: it renders nothing. Size: keep this file a small
 * "use client" wrapper that renders null or a fixed-size placeholder and
 * loads its card with dynamic(() => import("./home-notice-card")), because
 * sections.tsx imports it statically into Home's first load (§10.9 item 2).
 */
export function RestoreNotice() {
  return null;
}
