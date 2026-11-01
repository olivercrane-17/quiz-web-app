/**
 * The off implementation (ARCHITECTURE §7.6): every method resolves
 * `unavailable`, and rooms.subscribe returns a no-op. Practice, settings and
 * legal pages work fully; every online feature shows "This feature isn't
 * available on this server." (PRD §3.0.2).
 */
import { composeBackend, unavailableArea } from "../areas";
import type { GameBackend } from "../types";

export function createOffBackend(): GameBackend {
  return composeBackend("off", unavailableArea);
}
