/**
 * Extension point (ARCHITECTURE §2.3): Today's editor slot, composed by
 * src/features/home/sections.tsx. It holds the editor's Beta entry point.
 * Its owner checks isFeatureEnabled("editor") and renders nothing while the
 * flag is off.
 *
 * A stub until EDT-1: it renders nothing. Size: keep this file a small "use
 * client" wrapper that renders null or a fixed-size placeholder and loads
 * its card with dynamic(() => import("./home-card")), because sections.tsx
 * imports it statically into Home's first load (§10.9 item 2). Check
 * isFeatureEnabled("editor") before that import, so no editor code loads
 * while the flag is off (the flag object is parsed at run time, so a
 * minifier can't drop the branch). It loads its own data after first paint.
 */
export function EditorHomeSlot() {
  return null;
}
