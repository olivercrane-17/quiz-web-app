/**
 * Round 5's flows under SEC-1's `Referrer-Policy: no-referrer`
 * (ARCHITECTURE §10.8, PRD §8.4): IDN-2's sync code and restore, whose
 * backup-cookie POST must keep the page's Origin (the identity routes
 * refuse `Origin: null`, which the Fetch spec allows a browser to send for
 * a request outside fetch's default mode under this policy), and LGL-1's
 * credits page, whose licence texts and contents links must still work.
 * Each page arrives with the policy, and nothing it loads carries a Referer.
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

test.describe("Referrer-Policy: no-referrer on round 5's pages", () => {
  test("IDN-2's sync code shows at /me/sync, and a restore at /restore posts the backup cookie with the page's Origin and no Referer", async ({
    page,
    context,
    baseURL,
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
    expect((await request.response())?.status()).toBe(204);
    // Today took over, as the restored player, with its note.
    await expect(page.locator("[data-restore-notice] p")).toBeVisible();
    expect((await context.cookies()).map((cookie) => cookie.name)).toEqual([
      "__Host-pid",
    ]);
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
