/**
 * Whether an element is rendered. Next keeps up to three visited routes in
 * the document, hidden with `display: none` (React's `<Activity>`), so a
 * selector can match a copy that belongs to a hidden route; this tells them
 * apart. Older browsers without `checkVisibility` fall back to the layout
 * box.
 */
export function isShown(element: Element): boolean {
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility();
  }
  return element instanceof HTMLElement && element.offsetParent !== null;
}

/** The first element matching `selector` that is rendered, or null. */
export function firstShown<E extends Element = HTMLElement>(
  selector: string,
): E | null {
  for (const element of document.querySelectorAll<E>(selector)) {
    if (isShown(element)) return element;
  }
  return null;
}
