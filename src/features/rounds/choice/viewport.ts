/**
 * Where a choice round sits on the screen, and where focus may go (RITE
 * round 1: R1-12, R1-14, R1-21; DESIGN §10.2, §11; WCAG 2.4.11). Plain DOM
 * code, called from the round's layout effects, so every change lands
 * before paint. Without layout (a test DOM, a hidden route) each helper
 * leaves the page alone.
 */

/** Room between the sticky header and the question's top: the play column's own top padding. */
export const QUESTION_TOP_GAP_PX = 16;
/** The least of the sheet's body that shows when the sheet has to scroll inside itself. */
export const MIN_SHEET_BODY_PX = 96;

/** False for an element that is gone, or inside a subtree that is `display: none`. */
function isRendered(element: Element): boolean {
  if (!element.isConnected) return false;
  for (
    let node: Element | null = element;
    node !== null;
    node = node.parentElement
  ) {
    if (getComputedStyle(node).display === "none") return false;
  }
  return true;
}

/**
 * True when the player has put focus somewhere outside `root` on purpose:
 * on Leave, say. Focus on the page itself, inside `root`, or on an element
 * that is gone or hidden (the Continue that just unmounted, a link on a
 * route Next keeps mounted behind this one) is nowhere in particular, and
 * the round may move it (R1-14).
 */
export function focusIsElsewhere(root: Element | null): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (
    active === null ||
    active === document.body ||
    active === document.documentElement
  ) {
    return false;
  }
  if (root?.contains(active) === true) return false;
  return isRendered(active);
}

/**
 * How far down the screen the sticky or fixed headers reach: the play
 * header with its incident banner, or the page's `scroll-padding-top` when
 * that is larger (DS-1 sets it from the header's height, DESIGN §10.2).
 */
export function topInset(): number {
  let inset =
    Number.parseFloat(
      getComputedStyle(document.documentElement).scrollPaddingTop,
    ) || 0;
  for (const header of document.querySelectorAll("header")) {
    const { position } = getComputedStyle(header);
    if (position !== "sticky" && position !== "fixed") continue;
    const rect = header.getBoundingClientRect();
    // Hidden with its route, or not at the top edge.
    if (rect.height === 0 || rect.top > 1) continue;
    inset = Math.max(inset, rect.bottom);
  }
  return inset;
}

function canScroll(): boolean {
  return typeof window !== "undefined" && typeof window.scrollBy === "function";
}

/**
 * R1-12: scrolls up just enough that `element`'s top sits below the sticky
 * header, with the column's gap. A question that already starts lower (a
 * note above question 1, a page at its top) stays where it is.
 */
export function keepTopBelowHeader(element: HTMLElement | null): void {
  if (element === null || !canScroll()) return;
  const rect = element.getBoundingClientRect();
  if (rect.height === 0) return;
  const over = topInset() + QUESTION_TOP_GAP_PX - rect.top;
  if (over > 0) window.scrollBy({ top: -over, behavior: "instant" });
}

/**
 * R1-21, D12: brings the whole explanation sheet on screen, Continue
 * included. A sheet that fits below the options moves nothing. One that
 * doesn't scrolls the page just far enough that its bottom meets the
 * screen's. One taller than the screen under the header first lets its
 * body scroll inside it (`body`, never less than MIN_SHEET_BODY_PX), so the
 * title and Continue both stay in view; that body takes focus by keyboard,
 * so its text can be scrolled without a pointer.
 */
export function keepSheetInView(
  sheet: HTMLElement | null,
  body: HTMLElement | null,
): void {
  if (sheet === null || !canScroll()) return;
  const rect = sheet.getBoundingClientRect();
  const bottom = window.innerHeight;
  if (rect.height === 0 || rect.bottom <= bottom) return;
  const room = bottom - topInset();
  if (body !== null && rect.height > room) {
    const max = Math.max(
      MIN_SHEET_BODY_PX,
      body.clientHeight - (rect.height - room),
    );
    body.style.maxHeight = `${max}px`;
    body.style.overflowY = "auto";
    body.tabIndex = 0;
  }
  const over = sheet.getBoundingClientRect().bottom - bottom;
  if (over > 0) window.scrollBy({ top: over, behavior: "instant" });
}
