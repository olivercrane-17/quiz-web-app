/**
 * Spread on any element a home slot renders to move the Practice card above
 * the Daily card, as the Daily card's offline state does (PRD §3.1.7):
 * `<div {...HOME_PROMOTE_PRACTICE}>`. Today's layout reacts in CSS through
 * `:has()`, so no slot reaches into another.
 *
 * Kept free of imports, so a slot can import it without a cycle back
 * through the sections that import the slot.
 */
export const HOME_PROMOTE_PRACTICE = {
  "data-home-promote": "practice",
} as const;
