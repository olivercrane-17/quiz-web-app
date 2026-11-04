/**
 * Where a choice round sits on the screen, and where focus may go (RITE
 * round 1: R1-12, R1-14, R1-21; DESIGN §6.10, §10.2, §11; WCAG 2.4.11).
 * Plain DOM code, called from the round's layout effects, so every change
 * lands before paint. Without layout (a test DOM, a hidden route) each
 * helper leaves the page alone.
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

export interface SheetParts {
  /** The part of the sheet that may scroll inside it: the explanation and its links. */
  body?: HTMLElement | null;
  /**
   * What the sheet must leave on screen above it: the correct option and
   * the player's pick (DESIGN §6.10).
   */
  keep?: readonly Element[];
  /** Continue, which always ends on screen. */
  action?: HTMLElement | null;
}

/**
 * How far the page may scroll up before the sheet's title, or the top of a
 * box in `keep` with `gap` to spare, passes under the header.
 */
function scrollRoom(
  sheetTop: number,
  keep: readonly DOMRect[],
  areaTop: number,
  gap: number,
): number {
  let room = sheetTop - areaTop;
  for (const box of keep) room = Math.min(room, box.top - areaTop - gap);
  return Math.max(0, room);
}

/**
 * R1-21, D12: brings the whole explanation sheet on screen, Continue
 * included, without taking the correct option or the player's pick
 * (`keep`) under the header (DESIGN §6.10). A sheet that fits below the
 * options moves nothing. One that doesn't scrolls the page just far enough
 * that its bottom meets the screen's. When that would take the higher of
 * `keep`, or the sheet's own title, under the header, the sheet's `body`
 * scrolls inside it instead, never shorter than MIN_SHEET_BODY_PX, and the
 * page scrolls by what is left: the column's gap under the header stays
 * when the body can spare that much, and goes before an option does. That
 * body then takes focus by keyboard, so its text can be scrolled without a
 * pointer. When even the shortest body can't keep both options, the lower
 * one is kept, and failing that only the title: Continue always ends on
 * screen. Last, Continue is brought into the visual viewport, which a page
 * wider than a phone's screen leaves shorter than the layout viewport the
 * page scrolls (`visibleArea`).
 */
export function keepSheetInView(
  sheet: HTMLElement | null,
  { body = null, keep = [], action = null }: SheetParts = {},
): void {
  if (sheet === null || !canScroll()) return;
  const rect = sheet.getBoundingClientRect();
  if (rect.height === 0) return;
  const area = visibleArea();
  const needed = rect.bottom - area.bottom;
  if (needed > 0) {
    const kept = keep
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.height > 0)
      .sort((a, b) => a.top - b.top);
    // What the body can give up, then the most of `keep`, from the top,
    // that it saves: with the gap if it can, right under the header if not.
    const spare =
      body === null ? 0 : Math.max(0, body.clientHeight - MIN_SHEET_BODY_PX);
    let room = scrollRoom(rect.top, [], area.top, 0);
    for (let first = 0; first < kept.length; first += 1) {
      const rest = kept.slice(first);
      if (needed - scrollRoom(rect.top, rest, area.top, 0) <= spare) {
        room = scrollRoom(rect.top, rest, area.top, QUESTION_TOP_GAP_PX);
        break;
      }
    }
    if (body !== null && needed > room) {
      const max = Math.max(
        MIN_SHEET_BODY_PX,
        body.clientHeight - (needed - room),
      );
      if (max < body.clientHeight) {
        body.style.maxHeight = `${max}px`;
        body.style.overflowY = "auto";
        body.tabIndex = 0;
      }
    }
    const over = sheet.getBoundingClientRect().bottom - area.bottom;
    if (over > 0) window.scrollBy({ top: over, behavior: "instant" });
  }
  // The page may already be scrolled as far as it goes while the visual
  // viewport still ends above Continue; this moves the visual viewport too.
  if (action !== null && typeof action.scrollIntoView === "function") {
    const box = action.getBoundingClientRect();
    if (box.height > 0 && box.bottom > visibleArea().bottom + 0.5) {
      action.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }
}
