/**
 * Extension point (ARCHITECTURE §2.3): Today's review slot, composed by
 * src/features/home/sections.tsx. It holds the review card, "5 questions to
 * review" (PRD §3.3.7). Its owner checks isFeatureEnabled("review") and
 * renders nothing while the flag is off.
 *
 * A stub until REV-1: it renders nothing. Size: keep this file a small "use
 * client" wrapper that renders null or a fixed-size placeholder and loads
 * its card with dynamic(() => import("./home-card")), because sections.tsx
 * imports it statically into Home's first load (§10.9 item 2). Check
 * isFeatureEnabled("review") before that import. It loads its own data
 * after first paint.
 */
export function ReviewHomeSlot() {
  return null;
}
