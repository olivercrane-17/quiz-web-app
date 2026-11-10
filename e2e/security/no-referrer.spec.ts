/**
 * Round 5's flows under SEC-1's `Referrer-Policy: no-referrer`
 * (ARCHITECTURE §10.8, PRD §8.4): IDN-2's sync code and restore, whose
 * backup-cookie POST must keep the page's Origin (the identity routes
 * refuse `Origin: null`, which the Fetch spec allows a browser to send for
 * a request outside fetch's default mode under this policy), and LGL-1's
 * credits page, whose licence texts and contents links must still work.
 * Each page arrives with the policy, and nothing it loads carries a Referer.
 *
 * A WebKit that keeps no Secure cookie on the suite's http://127.0.0.1
 * (ARCHITECTURE §9.3's test note) leaves out only the check that the
 * backup cookie was stored (`keepsSecureCookieHere`); the POST's Origin,
 * its missing Referer and its 204 are asserted in every browser.
 */
import type { Page, Request } from "@playwright/test";

import { expect, test } from "../fixtures";
import { setDevice } from "../support/devices";
import { mockInit } from "../support/mock";

test.use({ timezoneId: "Europe/London" });

/**
 * Every finished request of `page` that carried a Referer. Under
 * no-referrer none may: not a script, a style sheet, a prefetch or a call.
 */
function watchReferers(page: Page): () => Promise<string[]> {
  const finished: Request[] = [];
  page.on("requestfinished", (request) => finished.push(request));
  return async () => {
    const referred: string[] = [];
    for (const request of finished) {
      const referer = await request.headerValue("referer");
      if (referer !== null) referred.push(`${request.url()} from ${referer}`);
    }
    return referred;
  };
}

/**
 * Whether this browser keeps a Secure cookie on the suite's
 * http://127.0.0.1 (ARCHITECTURE §9.3's test note). Chromium and Firefox
 * do, so they always assert the backup cookie; a WebKit that doesn't can
 * never hold `__Host-pid` here, so only that assertion is left out, noted
 * on the test, and the launch report's iPhone check covers it (production
 * is https). The probe sets and expires a cookie of its own from the page,
 * touching neither the app's storage nor its cookie.
 */
async function keepsSecureCookieHere(
  page: Page,
  browserName: string,
): Promise<boolean> {
  if (browserName !== "webkit") return true;
  const kept = await page.evaluate(() => {
    document.cookie = "__Host-qz-probe=1; Secure; Path=/; SameSite=Lax";
    const stored = document.cookie.includes("__Host-qz-probe=1");
    document.cookie =
      "__Host-qz-probe=; Max-Age=0; Secure; Path=/; SameSite=Lax";
    return stored;
  });
  if (!kept) {
    test.info().annotations.push({
      type: "webkit-cookie-gap",
      description:
        "WebKit keeps no Secure cookie on http://127.0.0.1: the assertion that the browser stored the backup cookie runs on Chromium and Firefox (ARCHITECTURE §9.3)",
    });
  }
  return kept;
}

test.describe("Referrer-Policy: no-referrer on round 5's pages", () => {
  test("IDN-2's sync code shows at /me/sync, and a restore at /restore posts the backup cookie with the page's Origin and no Referer", async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    // Another device in this context, its own namespace, has played today.
    const other = await context.newPage();
    await setDevice(other, "phone-a");
    await mockInit(other, { scenario: "finished_today" });
    const otherReferers = watchReferers(other);
    await other.goto("/");
    await expect(other.locator('[data-daily-card="finished"]')).toBeVisible();
    const sync = await other.goto("/me/sync");
    expect(sync?.headers()["referrer-policy"]).toBe("no-referrer");
    await other.getByRole("button", { name: "Show my code" }).click();
    const well = other.locator("[data-sync-code]");
    await expect(well).toBeVisible();
    const code = (await well.getAttribute("data-sync-code")) ?? "";
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(await otherReferers()).toEqual([]);

    // This page's own device (the one the backup cookie belongs to) restores it.
    const referers = watchReferers(page);
    const restore = await page.goto("/restore");
    expect(restore?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByRole("button", { name: "Restore" })).toBeEnabled();
    const posted = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === "/api/identity" &&
        request.method() === "POST",
    );
    await page.getByRole("textbox", { name: "Your sync code" }).fill(code);
    await page.getByRole("button", { name: "Restore" }).click();

    const request = await posted;
    const headers = await request.allHeaders();
    expect(headers.origin).toBe(new URL(baseURL ?? "").origin);
    expect(headers.referer).toBeUndefined();
    const response = await request.response();
    expect(response?.status()).toBe(204);
    // Issued in every browser, whether or not this one keeps it.
    expect(await response?.headerValue("set-cookie")).toMatch(
      /^__Host-pid=v1\./m,
    );
    // Today took over, as the restored player, with its note.
    await expect(page.locator("[data-restore-notice] p")).toBeVisible();
    const cookies = (await context.cookies()).map((cookie) => cookie.name);
    expect(cookies).toEqual(
      (await keepsSecureCookieHere(page, browserName)) ? ["__Host-pid"] : [],
    );
    expect(await referers()).toEqual([]);
  });

  test("LGL-1's credits page opens a licence text in place, moves to a section from its contents and leads on to another trust page, sending no Referer", async ({
    page,
  }) => {
    const referers = watchReferers(page);
    const response = await page.goto("/credits");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Credits");

    // A licence text opens in place.
    const licence = page.locator("details", {
      hasText: "Read the Fraunces licence",
    });
    await licence.getByText("Read the Fraunces licence").click();
    await expect(licence.locator("pre")).toContainText(
      "SIL OPEN FONT LICENSE Version 1.1",
    );

    // A contents link moves within the page.
    const contents = page.getByRole("navigation", { name: "On this page" });
    const link = contents.getByRole("link").last();
    const target = (await link.getAttribute("href")) ?? "";
    expect(target).toMatch(/^#\S+$/);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/credits${target}$`));
    await expect(page.locator(target)).toBeInViewport();

    // The footer leads on to the next trust page.
    await page
      .getByRole("navigation", { name: "About Knewt" })
      .getByRole("link", { name: "Privacy" })
      .click();
    await expect(page).toHaveURL("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
    expect(await referers()).toEqual([]);
  });
});
