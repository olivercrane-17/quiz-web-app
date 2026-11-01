/**
 * Extension point (ARCHITECTURE §2.3): Today's editor slot, composed by
 * src/features/home/sections.tsx. It holds the editor's Beta entry point.
 * Its owner checks isFeatureEnabled("editor") and renders nothing while the
 * flag is off.
 *
 * A stub until EDT-1: it renders nothing. Every slot is a client island or
 * nothing, and loads its own data after first paint.
 */
export function EditorHomeSlot() {
  return null;
}
