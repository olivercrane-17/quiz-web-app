/**
 * Extension point (ARCHITECTURE §2.3, §10.7): marks a screen where an app
 * update may apply. Home, results screens and stop screens call it; nothing
 * mid-question ever does, so an update never interrupts a question.
 *
 * A stub until PWA-1, which posts SKIP_WAITING to a waiting service worker
 * and reloads at the next safe point (AC-PWA-04). The signature stays.
 */
export function useSafePoint(): void {
  // Nothing to do until PWA-1 registers a service worker.
}
