/**
 * Extension point (ARCHITECTURE §2.3): Today's rooms slot, composed by
 * src/features/home/sections.tsx. It holds the Beta "Host a quiz night" row
 * below Practice (PRD §6.1). Nothing may mention rooms while the flag is off
 * (AC-ROM-13). Its owner checks isFeatureEnabled("rooms") and renders
 * nothing while the flag is off.
 *
 * A stub until ROM-2: it renders nothing. Every slot is a client island or
 * nothing, and loads its own data after first paint.
 */
export function RoomsHomeSlot() {
  return null;
}
