/**
 * Fixture user agents for in-app browser detection (ARCHITECTURE §9.4,
 * AC-IAB-01): one per app the PRD names, plus Safari as the system browser.
 * Each matches the rule inapp-spy 5.0.10 applies to that app. Telegram's
 * webview has an ordinary Android `wv` agent, and the page tells it apart
 * by the object Telegram adds (`window.TelegramWebview`), which a test sets
 * itself.
 *
 * Test data only: the unit tests and e2e/identity/*.spec.ts import it, and
 * no app code does. It has no imports, so Playwright can load it as is.
 */

export interface UserAgentFixture {
  /** A name for test titles. */
  name: string;
  userAgent: string;
  /** What the detection should report. */
  context: "in_app" | "browser";
  app: string;
  platform: "ios" | "android" | "desktop";
  /** Set `window.TelegramWebview` before the page loads. */
  telegramObject?: boolean;
}

const IOS_WEBKIT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36";

export const WHATSAPP_IOS: UserAgentFixture = {
  name: "WhatsApp on iOS",
  userAgent: `${IOS_WEBKIT} Mobile/15E148 WhatsApp/2.24.10.79 WAiOS/17.5`,
  context: "in_app",
  app: "whatsapp",
  platform: "ios",
};

export const WHATSAPP_ANDROID: UserAgentFixture = {
  name: "WhatsApp on Android",
  userAgent: `${ANDROID_WEBVIEW} WhatsApp/2.24.17.79 WA4A/14`,
  context: "in_app",
  app: "whatsapp",
  platform: "android",
};

export const INSTAGRAM_IOS: UserAgentFixture = {
  name: "Instagram on iOS",
  userAgent: `${IOS_WEBKIT} Mobile/15E148 Instagram 341.0.4.27.97 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 624004946)`,
  context: "in_app",
  app: "instagram",
  platform: "ios",
};

export const FACEBOOK_ANDROID: UserAgentFixture = {
  name: "Facebook on Android",
  userAgent: `${ANDROID_WEBVIEW} [FB_IAB/FB4A;FBAV/478.0.0.42.106;IABMV/1;]`,
  context: "in_app",
  app: "facebook",
  platform: "android",
};

export const TIKTOK_IOS: UserAgentFixture = {
  name: "TikTok on iOS",
  userAgent: `${IOS_WEBKIT} Mobile/15E148 musical_ly_35.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US`,
  context: "in_app",
  app: "tiktok",
  platform: "ios",
};

export const TELEGRAM_ANDROID: UserAgentFixture = {
  name: "Telegram on Android",
  userAgent: ANDROID_WEBVIEW,
  context: "in_app",
  app: "telegram",
  platform: "android",
  telegramObject: true,
};

export const SAFARI_IOS: UserAgentFixture = {
  name: "Safari on iOS",
  userAgent: `${IOS_WEBKIT} Version/17.5 Mobile/15E148 Safari/604.1`,
  context: "browser",
  app: "none",
  platform: "ios",
};

/** The in-app fixtures AC-IAB-01 names, in its order. */
export const IN_APP_FIXTURES: readonly UserAgentFixture[] = [
  WHATSAPP_IOS,
  WHATSAPP_ANDROID,
  INSTAGRAM_IOS,
  FACEBOOK_ANDROID,
  TIKTOK_IOS,
  TELEGRAM_ANDROID,
];

/** More apps §9.4's mapping covers, for the unit tests. */
export const MORE_APP_FIXTURES: readonly UserAgentFixture[] = [
  {
    name: "Messenger on iOS",
    userAgent: `${IOS_WEBKIT} Mobile/15E148 [FBAN/MessengerForiOS;FBAV/470.0.0.32.106;FBBV/634915203;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]`,
    context: "in_app",
    app: "messenger",
    platform: "ios",
  },
  {
    name: "Snapchat on iOS",
    userAgent: `${IOS_WEBKIT} Mobile/15E148 Snapchat/12.95.0.40 (like Safari/8618.2.12.10.4, panda)`,
    context: "in_app",
    app: "snapchat",
    platform: "ios",
  },
  {
    name: "LinkedIn on iOS",
    userAgent: `${IOS_WEBKIT} Mobile/15E148 [LinkedInApp]/9.30.430`,
    context: "in_app",
    app: "linkedin",
    platform: "ios",
  },
  {
    name: "the Google app on iOS",
    userAgent: `${IOS_WEBKIT} GSA/330.0.661049540 Mobile/15E148 Safari/604.1`,
    context: "in_app",
    app: "google",
    platform: "ios",
  },
  {
    name: "Threads on iOS",
    userAgent: `${IOS_WEBKIT} Mobile/15E148 Barcelona 349.0.0.29.81 (iPhone15,2; iOS 17_5; en_US; en)`,
    context: "in_app",
    app: "other",
    platform: "ios",
  },
  {
    name: "an unnamed Android webview",
    userAgent: ANDROID_WEBVIEW,
    context: "in_app",
    app: "other",
    platform: "android",
  },
  {
    name: "Chrome on Windows",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    context: "browser",
    app: "none",
    platform: "desktop",
  },
  {
    name: "Chrome on Android",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.103 Mobile Safari/537.36",
    context: "browser",
    app: "none",
    platform: "android",
  },
];
