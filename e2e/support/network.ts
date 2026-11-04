/**
 * Connectivity in specs (ARCHITECTURE §11.4). Taking the context offline
 * makes `navigator.onLine` false, and the mock backend then fails every
 * call with `offline`, as Supabase would.
 */
import type { Page } from "@playwright/test";

/**
 * What Next logs when a client navigation can't fetch its RSC payload and
 * falls back to a full navigation [verified, ARCHITECTURE §1.5]. Offline
 * specs expect it, and only it.
 */
export const OFFLINE_NAVIGATION_ERROR = "Failed to fetch RSC payload";

/** Takes the page's whole context offline, and waits until the page knows. */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
}

/** Brings the page's context back online, and waits until the page knows. */
export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
  await page.waitForFunction(() => navigator.onLine);
}

/**
 * What Chromium logs for each request that fails because the context is
 * offline (`Failed to load resource: net::ERR_INTERNET_DISCONNECTED`), such
 * as a link prefetch the router starts while offline [verified, Chromium
 * 1.63]. WebKit and Firefox word theirs differently: add them here when the
 * first offline spec runs on those legs.
 */
export const OFFLINE_LOAD_ERROR = "net::ERR_INTERNET_DISCONNECTED";

function dropMatching(errors: string[], text: string): number {
  let removed = 0;
  for (let index = errors.length - 1; index >= 0; index -= 1) {
    if (errors[index]?.includes(text) === true) {
      errors.splice(index, 1);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Removes exactly the offline navigation fallback's console errors from the
 * `consoleErrors` fixture's list, and returns how many it removed. Any
 * other error still fails the test.
 */
export function dropOfflineNavigationErrors(errors: string[]): number {
  return dropMatching(errors, OFFLINE_NAVIGATION_ERROR);
}

/**
 * Removes the browser's own reports of requests that failed because the
 * test took the context offline, and returns how many it removed. Errors
 * the app logs itself still fail the test.
 */
export function dropOfflineLoadErrors(errors: string[]): number {
  return dropMatching(errors, `Failed to load resource: ${OFFLINE_LOAD_ERROR}`);
}
