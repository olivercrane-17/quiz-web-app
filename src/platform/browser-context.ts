/**
 * Where the page is running (ARCHITECTURE §9.4, PRD §3.10.4): an installed
 * app, an in-app browser (and which app), or an ordinary browser, plus the
 * platform and, best effort, whether the window is private.
 *
 * ```ts
 * export interface DetectedContext extends BrowserContextInfo { privateWindow: boolean | null }
 * export function detectBrowserContext(): Promise<DetectedContext>; // memoized per page load
 * ```
 *
 * 1. **Installed:** `matchMedia('(display-mode: standalone)')` or
 *    `navigator.standalone`.
 * 2. **In-app:** `inapp-spy` 5.0.10, loaded with `import()` (call this from
 *    an effect, so it runs after first paint): its user-agent rules plus
 *    its Telegram object check. inapp-spy only reaches that check when the
 *    user agent looks like an ordinary browser, and Telegram's webviews
 *    often don't (an Android `wv` agent), so an in-app answer without an
 *    app gets the same check here. The experimental SFSafariViewController
 *    check is not used, so SFSafariViewController counts as `browser`.
 * 3. **App mapping:** whatsapp, instagram, facebook, messenger, tiktok,
 *    snapchat, linkedin and telegram map one to one; gsa is `google`;
 *    threads, twitter, line, wechat, reddit and an unnamed in-app browser
 *    are `other`; an ordinary browser is `none`.
 * 4. **Platform:** iPhone, iPad and iPod, or a Mac with touch points, are
 *    `ios`; Android is `android`; other desktop browsers are `desktop`; the
 *    rest `other`.
 * 5. **Private windows:** best effort only, `null` when unsure. Chromium's
 *    quota in an incognito window stays under twice the JS heap limit;
 *    Safari 17 and later refuse the origin private file system in a
 *    private window. A detection failure changes nothing else
 *    (PRD §3.10.5).
 *
 * Nothing here throws: a step that fails reads as `unknown` (the context)
 * or `null` (the private window). The result feeds `landing_view` (ANA-1),
 * `start_daily`'s `p_context` and `p_app` (DLY-2), the stop screen's offer
 * cards (DLY-3: no install, push or calendar UI in an in-app browser,
 * AC-IAB-05) and the sync-code triggers.
 */
import type { Platform } from "@/analytics/dictionary";
import type { AppTag, BrowserContextInfo } from "@/backend/types";

export interface DetectedContext extends BrowserContextInfo {
  /** True or false when a heuristic could tell; null when unsure. */
  privateWindow: boolean | null;
}

/** What inapp-spy answers (its `appKey` is one of its own app names). */
export interface InAppVerdict {
  isInApp: boolean;
  appKey: string | undefined;
}

/** The app names inapp-spy reports, and what each counts as (§9.4 step 3). */
const APP_TAGS: Readonly<Record<string, AppTag>> = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  facebook: "facebook",
  messenger: "messenger",
  tiktok: "tiktok",
  snapchat: "snapchat",
  linkedin: "linkedin",
  telegram: "telegram",
  gsa: "google",
  threads: "other",
  twitter: "other",
  line: "other",
  wechat: "other",
  reddit: "other",
};

/** The objects Telegram's webviews add to the page (inapp-spy's own check). */
const TELEGRAM_GLOBALS = [
  "TelegramWebview",
  "TelegramWebviewProxy",
  "TelegramWebviewProxyProto",
] as const;

/** The app an in-app browser belongs to, by inapp-spy's name for it. */
export function appTagOf(appKey: string | undefined): AppTag {
  if (appKey === undefined) return "other";
  return APP_TAGS[appKey] ?? "other";
}

/** §9.4 step 4, from the user agent and `navigator.maxTouchPoints`. */
export function platformOf(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  // iPadOS asks for desktop sites with a Mac user agent; touch gives it away.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";
  if (/Windows NT|Macintosh|Mac OS X|CrOS|X11|Linux x86_64/.test(userAgent)) {
    return "desktop";
  }
  return "other";
}

/** Everything §9.4 decides from, gathered once. */
export interface ContextSignals {
  userAgent: string;
  maxTouchPoints: number;
  installed: boolean;
  /** inapp-spy's answer, or null when it could not run. */
  inApp: InAppVerdict | null;
  /** One of Telegram's webview objects is on the page. */
  telegram: boolean;
}

/** §9.4 steps 1 to 4, as a pure function of the signals. */
export function classifyContext(signals: ContextSignals): BrowserContextInfo {
  const platform = platformOf(signals.userAgent, signals.maxTouchPoints);
  if (signals.installed) return { context: "installed", app: "none", platform };
  if (signals.inApp === null)
    return { context: "unknown", app: "none", platform };
  if (signals.inApp.isInApp) {
    const app =
      signals.inApp.appKey === undefined && signals.telegram
        ? "telegram"
        : appTagOf(signals.inApp.appKey);
    return { context: "in_app", app, platform };
  }
  return { context: "browser", app: "none", platform };
}

/** The slice of the browser the detection reads; tests pass their own. */
export interface DetectionEnvironment {
  navigator?: {
    userAgent?: string;
    maxTouchPoints?: number;
    standalone?: boolean;
    storage?: {
      estimate?: () => Promise<{ quota?: number }>;
      getDirectory?: () => Promise<unknown>;
    };
  };
  matchMedia?: (query: string) => { matches: boolean };
  /** Chromium's `performance.memory`. */
  performance?: { memory?: { jsHeapSizeLimit?: number } };
  /** The window, for Telegram's objects. */
  globals?: object;
  /** Runs inapp-spy; the default loads it with import(). */
  inAppSpy?: () => Promise<InAppVerdict>;
}

function isInstalled(env: DetectionEnvironment): boolean {
  try {
    if (env.matchMedia?.("(display-mode: standalone)").matches === true) {
      return true;
    }
  } catch {
    // No matchMedia: not installed.
  }
  return env.navigator?.standalone === true;
}

function hasTelegramObject(globals: object | undefined): boolean {
  if (globals === undefined) return false;
  return TELEGRAM_GLOBALS.some((name) => name in globals);
}

/** Chromium: a Chrome token and no Safari-only engine. */
function isChromium(userAgent: string): boolean {
  return /\b(?:Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser)\//.test(userAgent);
}

/** Safari's own engine: Version/ and Safari/, with no other browser's token. */
function isSafari(userAgent: string): boolean {
  return (
    /\bVersion\/[\d.]+.*\bSafari\//.test(userAgent) &&
    !/\b(?:Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg|OPR|Firefox)\//.test(
      userAgent,
    )
  );
}

/** How long a private-window heuristic may take before it counts as unsure. */
export const PRIVATE_CHECK_TIMEOUT_MS = 1500;

function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(fallback);
    }, PRIVATE_CHECK_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** §9.4 step 5: best effort, null when unsure. */
export async function detectPrivateWindow(
  env: DetectionEnvironment,
): Promise<boolean | null> {
  const userAgent = env.navigator?.userAgent ?? "";
  const storage = env.navigator?.storage;
  try {
    if (isSafari(userAgent) && typeof storage?.getDirectory === "function") {
      const getDirectory = storage.getDirectory.bind(storage);
      return await withTimeout<boolean | null>(
        getDirectory().then(
          () => false,
          (error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);
            return message.toLowerCase().includes("unknown transient reason")
              ? true
              : null;
          },
        ),
        null,
      );
    }
    const heapLimit = env.performance?.memory?.jsHeapSizeLimit;
    if (
      isChromium(userAgent) &&
      typeof storage?.estimate === "function" &&
      typeof heapLimit === "number" &&
      heapLimit > 0
    ) {
      const estimate = storage.estimate.bind(storage);
      const quota = await withTimeout<number | null>(
        estimate().then((result) =>
          typeof result.quota === "number" ? result.quota : null,
        ),
        null,
      );
      return quota === null ? null : quota < 2 * heapLimit;
    }
  } catch {
    // Unsure.
  }
  return null;
}

async function loadInAppSpy(): Promise<InAppVerdict> {
  const { default: InAppSpy } = await import("inapp-spy");
  const { isInApp, appKey } = InAppSpy();
  return { isInApp, appKey };
}

/** The environment of the page this module runs in. */
function pageEnvironment(): DetectionEnvironment {
  if (typeof window === "undefined") return {};
  return {
    navigator: window.navigator as DetectionEnvironment["navigator"],
    matchMedia:
      typeof window.matchMedia === "function"
        ? (query) => window.matchMedia(query)
        : undefined,
    performance: window.performance as DetectionEnvironment["performance"],
    globals: window,
  };
}

/** Runs §9.4 once against `env`. Never rejects. */
export async function detectIn(
  env: DetectionEnvironment,
): Promise<DetectedContext> {
  const userAgent = env.navigator?.userAgent ?? "";
  const installed = isInstalled(env);
  let inApp: InAppVerdict | null = null;
  if (!installed) {
    try {
      inApp = await (env.inAppSpy ?? loadInAppSpy)();
    } catch {
      // The chunk didn't load (offline, a deploy): unknown, nothing else.
    }
  }
  const info = classifyContext({
    userAgent,
    maxTouchPoints: env.navigator?.maxTouchPoints ?? 0,
    installed,
    inApp,
    telegram: hasTelegramObject(env.globals),
  });
  const privateWindow =
    info.context === "browser" ? await detectPrivateWindow(env) : null;
  return { ...info, privateWindow };
}

let detection: Promise<DetectedContext> | null = null;
let detected: DetectedContext | null = null;

/** Where the page runs (§9.4); memoized per page load. Never rejects. */
export function detectBrowserContext(): Promise<DetectedContext> {
  detection ??= detectIn(pageEnvironment()).then((result) => {
    detected = result;
    return result;
  });
  return detection;
}

/**
 * The detection's result once it has finished in this page, else null, for
 * code that can't wait (a start that must leave on the first tap).
 */
export function peekBrowserContext(): DetectedContext | null {
  return detected;
}

/** What a caller sends before the detection has answered. */
export const UNKNOWN_CONTEXT: Readonly<BrowserContextInfo> = Object.freeze({
  context: "unknown",
  app: "none",
  platform: "other",
});

/** Tests only: forget the memoized detection. */
export function resetBrowserContextForTests(): void {
  detection = null;
  detected = null;
}
