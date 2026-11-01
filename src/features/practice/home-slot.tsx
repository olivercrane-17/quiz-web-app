/**
 * Extension point (ARCHITECTURE §2.3): Today's practice slot, composed by
 * src/features/home/sections.tsx. It holds the Practice card: "Ten questions
 * on anything. Works offline.", Quick play and Choose a category (DESIGN
 * §12.1, AC-PRA-01).
 *
 * Today renders it twice and CSS shows one copy: `placement="regular"`
 * after the Daily and its notices, and `placement="promoted"` before the
 * Daily, shown only while a slot promotes Practice (the Daily card's
 * offline state, PRD §3.1.7). Keyboard and reading order then follow what
 * is on screen in every browser, which a CSS reorder would not (WCAG 1.3.2,
 * 2.4.3). The copy not on screen is `display: none`; only the copy on
 * screen may count an impression or warm anything up, so check
 * `element.checkVisibility()` first, and use `placement` in analytics.
 *
 * A stub until PRA-1 (Quick play), then PRA-2: it renders nothing. Size:
 * Quick play is one of the islands Home may load eagerly (§10.9 item 2),
 * with a byte target of 1 kB gzipped; anything else loads with dynamic().
 */
export interface PracticeHomeSlotProps {
  placement: "regular" | "promoted";
}

export function PracticeHomeSlot(_props: PracticeHomeSlotProps) {
  return null;
}
