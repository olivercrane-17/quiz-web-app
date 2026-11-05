/**
 * How to get from an in-app browser to the system browser (§9.5, PRD
 * §3.10.4, §5.14): the two taps for that app, and on Android an "Open in
 * Chrome" link through an `intent://` URL.
 */
import type { Platform } from "@/analytics/dictionary";
import type { AppTag } from "@/backend";

import {
  APP_MENU_ITEMS,
  APP_NAMES,
  IDENTITY_CLIENT_COPY,
} from "../client-copy";

/**
 * The two taps: open the app's menu, then its open-in-browser item, by
 * the app's name for it (`APP_MENU_ITEMS`) with the platform's wording as
 * the second guess. An in-app browser without a name gets the platform's
 * two taps.
 */
export function claimSteps(
  app: AppTag,
  platform: Platform,
): readonly [string, string] {
  const { steps } = IDENTITY_CLIENT_COPY.claim;
  const where =
    platform === "ios" || platform === "android" ? platform : "other";
  const name = APP_NAMES[app];
  if (name === null) return steps.unnamed[where];
  const platformItem = steps.platformItem[where];
  return [
    steps.menu[where](name),
    steps.choose(APP_MENU_ITEMS[app] ?? platformItem, platformItem),
  ];
}

/**
 * An Android intent link that opens `path` on this site in Chrome. When
 * Chrome is missing, Android follows the fallback URL, which opens the
 * same page where the player already is: nothing breaks.
 */
export function chromeIntentUrl(
  site: { protocol: string; host: string },
  path: string,
): string {
  const scheme = site.protocol.replace(/:$/, "");
  const fallback = encodeURIComponent(`${scheme}://${site.host}${path}`);
  return `intent://${site.host}${path}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}
