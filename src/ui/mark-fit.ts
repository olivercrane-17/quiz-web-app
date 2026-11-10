/**
 * How far a progress pill's mark steps its type down to stay inside the
 * pill at its narrowest, 28 px (DESIGN §6.6, RITE round 1 R1-03): one or
 * two characters ("M2", "+3", "E", 🎯) keep 15 px, three ("13%") take 12 px
 * and more take 10 px (`.kn-step[data-fit]` in ui.css). The Encore's pill
 * may show its % off once it is locked in (RITE round 2, R2-06).
 *
 * Pure, so the E2E that measures the fit uses the same rule.
 */
export type MarkFit = "snug" | "tight";

export function markFit(mark: string | undefined): MarkFit | undefined {
  if (mark === undefined) return undefined;
  // By code point, so an emoji counts once.
  const length = [...mark].length;
  if (length >= 4) return "tight";
  return length === 3 ? "snug" : undefined;
}
