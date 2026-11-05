/**
 * The claim link on the mock build (PRD §3.10.4, §5.14; ARCHITECTURE §9.5,
 * IDN-2). An in-app browser and the system browser are two device
 * namespaces in one context, so they share the mock server; the in-app one
 * gets WhatsApp's user agent on its own page.
 *
 * The stop screen shows its offer card once DLY-3 builds it; until then
 * the claim link is made where IDN-2 offers it too, at /me/sync inside an
 * in-app browser, through the same ClaimPanel the card renders.
 *
 * Covered: the address swap (AC-IAB-03), redeeming in the system browser
 * as the same player with Today's note (and Back never returning to the
 * spent link), the link opened back in the app that made it, the
 * expired-claim copy for a used, an out-of-date and an unknown link, the
 * address going back after 10 minutes (said in the status region, with
 * focus on Keep my streak), the confirm step on a browser with progress,
 * and Open in Chrome on Android.
 */
import type { BrowserContext, Page } from "@playwright/test";

import {
  WHATSAPP_ANDROID,
  WHATSAPP_IOS,
} from "../../src/features/identity/__fixtures__/user-agents";
import { expect, test } from "../fixtures";
import { expectNoSeriousAxe } from "../support/axe";
import { setDevice } from "../support/devices";
import { mockInit } from "../support/mock";

const CLAIM_PATH = /^\/claim\/[A-Za-z0-9_-]{32,}$/;
const EXPIRED =
  "This link has expired. Go back to the app where you played and tap 'Keep my streak' again, or use your sync code.";
const WHAT_MOVES =
  "Your streak, Daily history, Groups, challenges and achievements come with you. Practice stats stay on this device.";

interface StoredIdentity {
  playerId: string;
  secret: string;
  source: string;
}

/** A device in this context; `userAgent` stands in for an in-app browser. */
async function deviceIn(
  context: BrowserContext,
  device: string,
  init: { finished?: boolean; userAgent?: string } = {},
): Promise<Page> {
  const page = await context.newPage();
  await setDevice(page, device);
  if (init.finished === true) {
    await mockInit(page, { scenario: "finished_today" });
  }
  if (init.userAgent !== undefined) {
    await page.addInitScript((agent) => {
      Object.defineProperty(Navigator.prototype, "userAgent", {
        configurable: true,
        get: () => agent,
      });
    }, init.userAgent);
  }
  return page;
}

async function identityOf(
  page: Page,
  device: string,
): Promise<StoredIdentity | null> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null") as never,
    `qz:d:${device}:identity`,
  );
}

/**
 * Today, for a device whose init scenario played today's Daily: the mock
 * seeds the scenario, and registers the device, once Today loads the
 * backend, as a real device registers with its own first write.
 */
async function openToday(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-daily-card="finished"]')).toBeVisible();
}

/** In the app: Keep my streak at /me/sync; returns the claim's path. */
async function makeClaim(app: Page): Promise<string> {
  await openToday(app);
  await app.goto("/me/sync");
  await expect(
    app.getByRole("heading", { name: "Playing inside WhatsApp?" }),
  ).toBeVisible();
  await app.getByRole("button", { name: "Keep my streak" }).click();
  await expect.poll(() => new URL(app.url()).pathname).toMatch(CLAIM_PATH);
  return new URL(app.url()).pathname;
}

test.use({ timezoneId: "Europe/London" });

test.describe("the claim link (PRD §3.10.4)", () => {
  test("AC-IAB-03 after a finished Daily inside WhatsApp, Keep my streak swaps the address to /claim/<token> and shows the two taps", async ({
    context,
  }) => {
    const app = await deviceIn(context, "wa", {
      finished: true,
      userAgent: WHATSAPP_IOS.userAgent,
    });
    await openToday(app);
    await app.goto("/me/sync");
    // The page says what moves (AC-SYN-07), once, and the sync code sits
    // below the claim.
    await expect(app.getByText(WHAT_MOVES)).toBeVisible();
    await expect(app.getByText(WHAT_MOVES)).toHaveCount(1);
    await expect(
      app.getByRole("heading", { name: "Or save your sync code" }),
    ).toBeVisible();
    const path = await makeClaim(app);
    expect(path).toMatch(CLAIM_PATH);
    await expect(
      app.getByRole("heading", { name: "Now open this page in your browser" }),
    ).toBeFocused();
    // The two taps for WhatsApp.
    await expect(
      app.getByText(
        "Tap WhatsApp's menu, the three dots (⋯) at the top or bottom of the screen.",
      ),
    ).toBeVisible();
    await expect(
      app.getByText(
        "Choose Open in browser. Some versions say Open in Safari.",
      ),
    ).toBeVisible();
    await expect(
      app.getByText("This link works for 10 minutes."),
    ).toBeVisible();
    // The page stays as it was while the address carries the link.
    await expect(
      app.getByRole("heading", { name: "Playing inside WhatsApp?" }),
    ).toBeVisible();
  });

  test("the system browser continues as the same player, keeps the in-app copy working, and lands on Today with the note", async ({
    context,
  }) => {
    const app = await deviceIn(context, "wa", {
      finished: true,
      userAgent: WHATSAPP_IOS.userAgent,
    });
    const path = await makeClaim(app);
    const inApp = await identityOf(app, "wa");

    const browser = await deviceIn(context, "safari");
    await browser.goto(path);
    const card = browser.getByRole("region", {
      name: /^Continue as \S+ \S+\?$/,
    });
    await expect(card).toBeVisible();
    await expect(
      card.getByText(/^Streak 1 · Daily No.\s\d+ done$/),
    ).toBeVisible();
    await expect(card.getByText(WHAT_MOVES)).toBeVisible();
    await card.getByRole("button", { name: "Continue" }).click();

    await expect(browser).toHaveURL(/\/$/);
    await expect(browser.locator("[data-restore-notice] p")).toHaveText(
      "You're all set. Your streak is safe in this browser.",
    );
    await expect(browser.locator('[data-daily-card="finished"]')).toBeVisible();
    const claimed = await identityOf(browser, "safari");
    expect(claimed).toMatchObject({
      playerId: inApp?.playerId,
      source: "claim",
    });
    expect(claimed?.secret).not.toBe(inApp?.secret);
    // Today took the claim page's place: Back never lands on the spent link.
    await browser.goBack();
    expect(new URL(browser.url()).pathname).not.toMatch(/^\/claim\//);
    await expect(browser.getByText(EXPIRED)).toHaveCount(0);
    // The in-app copy keeps working: a credential was added, none replaced.
    await app.goto("/");
    await expect(app.locator('[data-daily-card="finished"]')).toBeVisible();
  });

  test("opened back in the app that made it, the link says the profile is already here and never redeems it", async ({
    context,
  }) => {
    const app = await deviceIn(context, "wa", {
      finished: true,
      userAgent: WHATSAPP_IOS.userAgent,
    });
    const path = await makeClaim(app);
    await app.reload();
    await expect(
      app.getByText(/You made this link on this device/),
    ).toBeVisible();
    // Still live for the system browser.
    const browser = await deviceIn(context, "safari");
    await browser.goto(path);
    await expect(
      browser.getByRole("button", { name: "Continue" }),
    ).toBeVisible();
  });

  test("the expired-claim copy shows for a used link, with Enter a sync code", async ({
    context,
  }) => {
    const app = await deviceIn(context, "wa", {
      finished: true,
      userAgent: WHATSAPP_IOS.userAgent,
    });
    const path = await makeClaim(app);
    const first = await deviceIn(context, "safari");
    await first.goto(path);
    await first.getByRole("button", { name: "Continue" }).click();
    await expect(first.locator("[data-restore-notice]")).toBeVisible();

    const second = await deviceIn(context, "chrome");
    await second.goto(path);
    await expect(second.getByText(EXPIRED)).toBeVisible();
    await second.getByRole("link", { name: "Enter a sync code" }).click();
    await expect(second).toHaveURL(/\/restore$/);
    await expect(
      second.getByRole("textbox", { name: "Your sync code" }),
    ).toBeVisible();
  });

  test("the expired-claim copy shows for a link opened at 10 min 1 s, and for one nobody holds", async ({
    context,
  }) => {
    const app = await deviceIn(context, "wa", {
      finished: true,
      userAgent: WHATSAPP_IOS.userAgent,
    });
    const path = await makeClaim(app);
    const late = await deviceIn(context, "safari");
    await late.clock.install({ time: Date.now() + 10 * 60_000 + 1000 });
    await late.goto(path);
    await expect(late.getByText(EXPIRED)).toBeVisible();

    const unknown = await deviceIn(context, "chrome");
    await unknown.goto("/claim/kq3Zr0x9TWb7vY4mN2cH8sLp6eJd1gAfUoXiRtBnM5w");
    await expect(unknown.getByText(EXPIRED)).toBeVisible();
    await unknown.goto("/shell/claim");
    await expect(unknown.getByText(EXPIRED)).toBeVisible();
  });

  test("after 10 minutes the address goes back and the card offers a new link", async ({
    context,
  }) => {
    const app = await deviceIn(context, "wa", {
      finished: true,
      userAgent: WHATSAPP_IOS.userAgent,
    });
    await app.clock.install();
    await makeClaim(app);
    await app.clock.fastForward("10:01");
    await expect.poll(() => new URL(app.url()).pathname).toBe("/me/sync");
    const ranOut = "That link has run out. Tap Keep my streak for a new one.";
    await expect(app.locator("[data-claim-message]")).toHaveText(ranOut);
    const keep = app.getByRole("button", { name: "Keep my streak" });
    await expect(keep).toBeVisible();
    // Said in the status region, and still there once the address changed
    // back; focus went to Keep my streak, not to the page.
    await expect(app.locator("#qz-live-polite")).toHaveText(ranOut);
    await expect(keep).toBeFocused();
  });

  test("a browser with progress of its own confirms first; Cancel keeps its identity", async ({
    context,
  }) => {
    const app = await deviceIn(context, "wa", {
      finished: true,
      userAgent: WHATSAPP_IOS.userAgent,
    });
    const path = await makeClaim(app);
    const browser = await deviceIn(context, "safari");
    await browser.goto("/");
    await browser.getByRole("link", { name: "Play today's Daily" }).click();
    await expect(
      browser.getByRole("heading", { name: /clue 1\b/i }),
    ).toBeVisible();
    const before = await identityOf(browser, "safari");

    await browser.goto(path);
    await browser.getByRole("button", { name: "Continue" }).click();
    const dialog = browser.getByRole("dialog", {
      name: "Replace this device's progress?",
    });
    await expect(
      dialog.getByText(
        "This device has its own progress. Continuing replaces it with the profile from your link.",
      ),
    ).toBeVisible();
    await expect(dialog.getByText(WHAT_MOVES)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(await identityOf(browser, "safari")).toEqual(before);
  });

  test("the claim card and the claim page pass axe and fit a 320 px screen", async ({
    context,
  }) => {
    const fits = (page: Page) =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    const app = await deviceIn(context, "wa", {
      finished: true,
      userAgent: WHATSAPP_ANDROID.userAgent,
    });
    await app.setViewportSize({ width: 320, height: 640 });
    const path = await makeClaim(app);
    await expectNoSeriousAxe(app);
    expect(await fits(app)).toBe(true);

    const browser = await deviceIn(context, "safari");
    await browser.setViewportSize({ width: 320, height: 640 });
    await browser.goto(path);
    await expect(
      browser.getByRole("button", { name: "Continue" }),
    ).toBeVisible();
    await expectNoSeriousAxe(browser);
    expect(await fits(browser)).toBe(true);
    await browser.goto("/shell/claim");
    await expect(browser.getByText(EXPIRED)).toBeVisible();
    await expectNoSeriousAxe(browser);
  });

  test("on Android, Open in Chrome opens the claim through an intent link", async ({
    context,
  }) => {
    const app = await deviceIn(context, "wa", {
      finished: true,
      userAgent: WHATSAPP_ANDROID.userAgent,
    });
    const path = await makeClaim(app);
    const chrome = app.getByRole("link", { name: "Open in Chrome" });
    await expect(chrome).toBeVisible();
    const host = new URL(app.url()).host;
    await expect(chrome).toHaveAttribute(
      "href",
      `intent://${host}${path}#Intent;scheme=http;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(`http://${host}${path}`)};end`,
    );
    await expect(
      app.getByText(
        "Tap WhatsApp's menu, the three dots (⋮) at the top right.",
      ),
    ).toBeVisible();
  });
});
