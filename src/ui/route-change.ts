/**
 * The shell's signal that the address changed, for what outlives a page:
 * a toast shown above one page's dock is placed again above the next
 * page's bar (./toast.ts). The shell fires it from the layout effect that
 * clears the live regions (R1-09), once the new page is in the document.
 * A tiny module of its own, so the root layout never loads the toast.
 */
const ROUTE_CHANGE_EVENT = "kn:routechange";

/** Tells every listener the address changed. */
export function signalRouteChange(): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
}

/** Runs `listener` after each change of address; returns the unsubscribe. */
export function onRouteChange(listener: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener(ROUTE_CHANGE_EVENT, listener);
  return () => {
    document.removeEventListener(ROUTE_CHANGE_EVENT, listener);
  };
}
