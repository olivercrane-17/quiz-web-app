/**
 * Extension point (ARCHITECTURE §2.3): Today's daily slot, composed by
 * src/features/home/sections.tsx. It holds the Daily ticket (PRD §3.1.7,
 * DESIGN §12.1), first on Today. In its offline state it renders an element
 * with data-home-promote="practice", which moves the Practice card above it
 * (HOME_PROMOTE_PRACTICE in @/features/home).
 *
 * A stub until DLY-1 (not started, in progress and finished), then DLY-2
 * (every state of PRD §3.1.7): it renders nothing. Every slot is a client
 * island or nothing, and loads its own data after first paint.
 */
export function DailyHomeSlot() {
  return null;
}
