/**
 * How to get from an in-app browser to the system browser (§9.5, PRD
 * §3.10.4): the two taps for the platform, and on Android an "Open in
 * Chrome" link through an `intent://` URL.
 */
import type { Platform } from "@/analytics/dictionary";

import { IDENTITY_CLIENT_COPY } from "../client-copy";

/** The two taps: open the app's menu, then its open-in-browser item. */
export function claimSteps(platform: Platform): readonly string[] {
  const { steps } = IDENTITY_CLIENT_COPY.claim;
  if (platform === "ios") return steps.ios;
  if (platform === "android") return steps.android;
  return steps.other;
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
