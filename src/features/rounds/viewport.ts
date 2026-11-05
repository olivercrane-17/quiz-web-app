/**
 * Where a round sits under the sticky play header (RITE round 1: R1-12;
 * DESIGN §10.2, §11; WCAG 2.4.11), shared by every round family: the
 * choice round's question and the Mystery's reveal both start just below
 * the header, never under it. Plain DOM code, called from layout effects,
 * so every change lands before paint. Without layout (a test DOM, a hidden
 * route) each helper leaves the page alone.
 */

/** Room between the sticky header and a round's top: the play column's own top padding. */
export const TOP_GAP_PX = 16;

function canScroll(): boolean {
  return typeof window !== "undefined" && typeof window.scrollBy === "function";
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

/**
 * The part of the screen the player sees, in the viewport coordinates
 * `getBoundingClientRect()` uses: from under the sticky header (`top`) to
 * the bottom of the visual viewport (`bottom`). When a page is wider than a
 * phone's screen (a revealed option's tag at 200% text, say), Chrome makes
 * the layout viewport, and `innerHeight` with it, taller than the screen,
 * so the visual viewport is what's on the glass.
 */
export function visibleArea(): { top: number; bottom: number } {
  const viewport = window.visualViewport;
  const offset = viewport?.offsetTop ?? 0;
  return {
    top: Math.max(topInset(), offset),
    bottom: viewport ? offset + viewport.height : window.innerHeight,
  };
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
  const over = topInset() + TOP_GAP_PX - rect.top;
  if (over > 0) window.scrollBy({ top: -over, behavior: "instant" });
}

/**
 * R1-12, the reveal's half: a reveal replaces its round in place, so it
 * starts where the round started, which is above the screen once the page
 * has scrolled down to the options. Its heading takes focus without the
 * browser's scroll (`focus({ preventScroll: true })`), which would only
 * nudge the heading to the screen's top edge, under the sticky header,
 * with the stamp and the kicker above it out of sight. Then:
 *
 * - a `card` that starts under the header, or above the screen, scrolls
 *   back down just enough to start below the header with the column's gap,
 *   so its kicker, stamp and heading all show;
 * - a card that already starts lower stays put, unless its `heading` ends
 *   below the screen: then the page scrolls just far enough to show the
 *   heading, never taking the card's top under the header.
 */
export function keepRevealInView(
  card: HTMLElement | null,
  heading: HTMLElement | null = card,
): void {
  if (card === null || !canScroll()) return;
  const rect = card.getBoundingClientRect();
  if (rect.height === 0) return;
  const area = visibleArea();
  const top = area.top + TOP_GAP_PX;
  if (rect.top < top) {
    window.scrollBy({ top: rect.top - top, behavior: "instant" });
    return;
  }
  const box = (heading ?? card).getBoundingClientRect();
  const under = box.bottom + TOP_GAP_PX - area.bottom;
  if (box.height > 0 && under > 0) {
    window.scrollBy({
      top: Math.min(under, rect.top - top),
      behavior: "instant",
    });
  }
}

/**
 * Focuses a reveal's heading as it arrives (AC-DLY-18) and puts its card
 * where it can be read (`keepRevealInView`). Focus moves without the
 * browser's scroll, which is the card's to decide.
 */
export function focusReveal(
  heading: HTMLElement | null,
  card: HTMLElement | null,
): void {
  if (heading === null) return;
  heading.focus({ preventScroll: true });
  keepRevealInView(card ?? heading, heading);
}
