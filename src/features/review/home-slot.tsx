/**
 * Extension point (ARCHITECTURE §2.3): Today's review slot, composed by
 * src/features/home/sections.tsx. It holds the review card, "5 questions to
 * review" (PRD §3.3.7). Its owner checks isFeatureEnabled("review") and
 * renders nothing while the flag is off.
 *
 * A stub until REV-1: it renders nothing. Every slot is a client island or
 * nothing, and loads its own data after first paint.
 */
export function ReviewHomeSlot() {
  return null;
}
