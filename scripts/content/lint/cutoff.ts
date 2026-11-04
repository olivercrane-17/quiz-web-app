/**
 * The rules added in Wave 3 (CNT-1's additions to C14, C15 and C18 in
 * scripts/content/lib/rules.ts; CNT-2's C26, C27 and C28 and its additions
 * to C08, C11, C12, C13, C14, C15, C17 and C22 in this folder) must not turn
 * content red that an editor accepted before they existed. Such an item
 * warns, so the editor reworks it, until QA-2's launch check
 * (`content:check -- --launch`) makes every rule an error again.
 *
 * Only items accepted before the rules landed are spared. An item whose
 * `verification.editor.decidedAt` falls on or after RULES_LANDED_AT was
 * accepted with these rules in force (content:decide runs them), so each
 * rule keeps its own severity on it.
 */
import type { AnyItem } from "../../../src/content/schema/items.ts";

/** The rules landed on 4 November 2026; acceptances from the next day on meet them. */
export const RULES_LANDED_AT = "2026-11-05T00:00:00Z";

/** True for an active item the editor accepted before RULES_LANDED_AT. */
export function acceptedBeforeRules(item: AnyItem): boolean {
  if (item.status !== "active") return false;
  const decidedAt = item.verification?.editor?.decidedAt;
  if (decidedAt === undefined) return false;
  return Date.parse(decidedAt) < Date.parse(RULES_LANDED_AT);
}
