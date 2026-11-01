/**
 * Extension point (ARCHITECTURE §2.3): "Your Groups" on the stop screen
 * (PRD §3.1.6 item 4), one line per Group, up to three, then "See all":
 * "Uni lot: 2nd of 6 so far today · 2 not yet · See board". Fed by
 * `groups.todayRanks`, refetched with each visit. The stop screen renders it
 * only for ranked results; the row hides itself when the player is in no
 * Group.
 *
 * A stub until GRP-1. It renders nothing until then.
 */
export function GroupsRow() {
  return null;
}
