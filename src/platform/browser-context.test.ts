/**
 * In-app browser detection (ARCHITECTURE §9.4): the fixture user agents of
 * AC-IAB-01 through the real inapp-spy, the app mapping, the platform, an
 * installed app, the private-window heuristics, and failures that change
 * nothing else (PRD §3.10.5).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IN_APP_FIXTURES,
  MORE_APP_FIXTURES,
  SAFARI_IOS,
  type UserAgentFixture,
} from "@/features/identity/testing/user-agents";

import {
  PRIVATE_CHECK_TIMEOUT_MS,
  appTagOf,
  classifyContext,
  detectBrowserContext,
  detectIn,
  detectPrivateWindow,
  peekBrowserContext,
  platformOf,
  resetBrowserContextForTests,
  type DetectionEnvironment,
} from "./browser-context";

const CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

/** The page's own user agent, as inapp-spy reads it, for one test. */
function useUserAgent(fixture: UserAgentFixture): void {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
    fixture.userAgent,
  );
  if (fixture.telegramObject === true) {
    (window as unknown as { TelegramWebview?: object }).TelegramWebview = {};
  }
}

afterEach(() => {
  delete (window as unknown as { TelegramWebview?: object }).TelegramWebview;
  resetBrowserContextForTests();
});

describe("detectBrowserContext (§9.4)", () => {
  for (const fixture of IN_APP_FIXTURES) {
    it(`AC-IAB-01 ${fixture.name} is in_app with app ${fixture.app}`, async () => {
      useUserAgent(fixture);
      const detected = await detectBrowserContext();
      expect(detected).toEqual({
        context: "in_app",
        app: fixture.app,
        platform: fixture.platform,
        privateWindow: null,
      });
    });
  }

  it("AC-IAB-01 Safari on iOS is the system browser", async () => {
    useUserAgent(SAFARI_IOS);
    const detected = await detectBrowserContext();
    expect(detected).toMatchObject({
      context: "browser",
      app: "none",
      platform: "ios",
    });
  });

  for (const fixture of MORE_APP_FIXTURES) {
    it(`maps ${fixture.name} to ${fixture.context} and ${fixture.app}`, async () => {
      useUserAgent(fixture);
      const detected = await detectBrowserContext();
      expect(detected).toMatchObject({
        context: fixture.context,
        app: fixture.app,
        platform: fixture.platform,
      });
    });
  }

  it("is memoized per page load, and peekBrowserContext answers once it finished", async () => {
    useUserAgent(SAFARI_IOS);
    expect(peekBrowserContext()).toBeNull();
    const first = detectBrowserContext();
    expect(detectBrowserContext()).toBe(first);
    const detected = await first;
    expect(peekBrowserContext()).toBe(detected);
  });
});

describe("detectIn", () => {
  function env(
    overrides: Partial<DetectionEnvironment> = {},
  ): DetectionEnvironment {
    return {
      navigator: { userAgent: CHROME_DESKTOP, maxTouchPoints: 0 },
      inAppSpy: () => Promise.resolve({ isInApp: false, appKey: undefined }),
      ...overrides,
    };
  }

  it("calls an installed app installed, without asking inapp-spy", async () => {
    const inAppSpy = vi.fn(() =>
      Promise.resolve({ isInApp: true, appKey: "whatsapp" }),
    );
    const detected = await detectIn(
      env({ matchMedia: () => ({ matches: true }), inAppSpy }),
    );
    expect(detected).toEqual({
      context: "installed",
      app: "none",
      platform: "desktop",
      privateWindow: null,
    });
    expect(inAppSpy).not.toHaveBeenCalled();
  });

  it("reads navigator.standalone (iOS) as installed too", async () => {
    const detected = await detectIn(
      env({
        navigator: { userAgent: SAFARI_IOS.userAgent, standalone: true },
      }),
    );
    expect(detected.context).toBe("installed");
    expect(detected.platform).toBe("ios");
  });

  it("is unknown, and nothing else, when inapp-spy can't load", async () => {
    const detected = await detectIn(
      env({ inAppSpy: () => Promise.reject(new Error("ChunkLoadError")) }),
    );
    expect(detected).toEqual({
      context: "unknown",
      app: "none",
      platform: "desktop",
      privateWindow: null,
    });
  });

  it("finds Telegram by its object when inapp-spy names no app", async () => {
    const detected = await detectIn(
      env({
        inAppSpy: () => Promise.resolve({ isInApp: true, appKey: undefined }),
        globals: { TelegramWebviewProxy: {} },
      }),
    );
    expect(detected.app).toBe("telegram");
    const unnamed = await detectIn(
      env({
        inAppSpy: () => Promise.resolve({ isInApp: true, appKey: undefined }),
        globals: {},
      }),
    );
    expect(unnamed.app).toBe("other");
  });
});

describe("the mapping (§9.4 steps 3 and 4)", () => {
  it("maps inapp-spy's app names to the app tags", () => {
    expect(appTagOf("whatsapp")).toBe("whatsapp");
    expect(appTagOf("messenger")).toBe("messenger");
    expect(appTagOf("gsa")).toBe("google");
    for (const name of ["threads", "twitter", "line", "wechat", "reddit"]) {
      expect(appTagOf(name)).toBe("other");
    }
    expect(appTagOf(undefined)).toBe("other");
    expect(appTagOf("an-app-from-the-future")).toBe("other");
  });

  it("tells the platforms apart, an iPad asking for the desktop site included", () => {
    expect(platformOf(SAFARI_IOS.userAgent)).toBe("ios");
    const ipadDesktop =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
    expect(platformOf(ipadDesktop, 5)).toBe("ios");
    expect(platformOf(ipadDesktop, 0)).toBe("desktop");
    expect(platformOf("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(
      "android",
    );
    expect(platformOf(CHROME_DESKTOP)).toBe("desktop");
    expect(
      platformOf("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/127"),
    ).toBe("desktop");
    expect(platformOf("SmartTV/1.0")).toBe("other");
    expect(platformOf("")).toBe("other");
  });

  it("classifies from the signals alone", () => {
    const base = {
      userAgent: SAFARI_IOS.userAgent,
      maxTouchPoints: 5,
      installed: false,
      telegram: false,
    };
    expect(
      classifyContext({
        ...base,
        inApp: { isInApp: true, appKey: "instagram" },
      }),
    ).toEqual({ context: "in_app", app: "instagram", platform: "ios" });
    expect(classifyContext({ ...base, inApp: null })).toEqual({
      context: "unknown",
      app: "none",
      platform: "ios",
    });
  });
});

describe("private windows (§9.4 step 5, best effort)", () => {
  const SAFARI = SAFARI_IOS.userAgent;

  it("reads Chromium's quota under twice the heap limit as private", async () => {
    const heap = { memory: { jsHeapSizeLimit: 4_294_705_152 } };
    const quota = (value: number) => ({
      navigator: {
        userAgent: CHROME_DESKTOP,
        storage: { estimate: () => Promise.resolve({ quota: value }) },
      },
      performance: heap,
    });
    expect(await detectPrivateWindow(quota(1_200_000_000))).toBe(true);
    expect(await detectPrivateWindow(quota(300_000_000_000))).toBe(false);
  });

  it("reads Safari's refused private file system as private, and its open one as not", async () => {
    const safari = (getDirectory: () => Promise<unknown>) => ({
      navigator: { userAgent: SAFARI, storage: { getDirectory } },
    });
    expect(
      await detectPrivateWindow(
        safari(() =>
          Promise.reject(
            new Error(
              "UnknownError: The operation failed for an unknown transient reason (e.g. out of memory).",
            ),
          ),
        ),
      ),
    ).toBe(true);
    expect(await detectPrivateWindow(safari(() => Promise.resolve({})))).toBe(
      false,
    );
    expect(
      await detectPrivateWindow(
        safari(() => Promise.reject(new Error("SecurityError"))),
      ),
    ).toBeNull();
  });

  it("is unsure without the APIs, or for another engine", async () => {
    expect(
      await detectPrivateWindow({ navigator: { userAgent: CHROME_DESKTOP } }),
    ).toBeNull();
    expect(
      await detectPrivateWindow({
        navigator: {
          userAgent:
            "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
          storage: { estimate: () => Promise.resolve({ quota: 1 }) },
        },
        performance: { memory: { jsHeapSizeLimit: 100 } },
      }),
    ).toBeNull();
  });

  it("gives up as unsure when a heuristic hangs", async () => {
    vi.useFakeTimers();
    try {
      const verdict = detectPrivateWindow({
        navigator: {
          userAgent: CHROME_DESKTOP,
          storage: { estimate: () => new Promise(() => {}) },
        },
        performance: { memory: { jsHeapSizeLimit: 100 } },
      });
      await vi.advanceTimersByTimeAsync(PRIVATE_CHECK_TIMEOUT_MS);
      expect(await verdict).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("only asks in an ordinary browser", async () => {
    const estimate = vi.fn(() => Promise.resolve({ quota: 1 }));
    const detected = await detectIn({
      navigator: { userAgent: CHROME_DESKTOP, storage: { estimate } },
      performance: { memory: { jsHeapSizeLimit: 100 } },
      inAppSpy: () => Promise.resolve({ isInApp: true, appKey: "tiktok" }),
    });
    expect(detected.privateWindow).toBeNull();
    expect(estimate).not.toHaveBeenCalled();
  });
});
