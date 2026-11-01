/**
 * The playable greybox (ARCHITECTURE §12.2).
 *
 * Wave 0 checks the shell: Home renders with its four destinations, its
 * greeting and its skip link. The Wave 1 exit flows are declared here as
 * `test.fixme`; DLY-1 writes them and un-fixmes them once PRA-1, MYS-1 and
 * DLY-1 have merged (Quick play to results, a fixture Daily to the stop
 * screen with share text, and reload resuming mid-Mystery).
 */
import { expect, test } from "./fixtures";

test.describe("the greybox shell", () => {
  test("Home shows the four tab-bar destinations by name", async ({ page }) => {
    await page.goto("/");

    // One bar per width: the bottom bar on phones, the top bar from 768 px.
    const bar = page.getByRole("navigation", { name: "Main" });
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeVisible();
    const links = bar.getByRole("link");
    await expect(links).toHaveText(["Today", "Practice", "Groups", "Me"]);
    for (const [name, href] of [
      ["Today", "/"],
      ["Practice", "/practice"],
      ["Groups", "/g"],
      ["Me", "/me"],
    ] as const) {
      await expect(
        bar.getByRole("link", { name, exact: true }),
      ).toHaveAttribute("href", href);
    }
    await expect(bar.getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(bar.locator("[aria-current]")).toHaveCount(1);
  });

  test("Skip to content comes first and lands on the main content", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "keyboard focus order is checked in Chromium",
    );
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("Skip to content still lands on the page shown after a move between route groups", async ({
    page,
  }) => {
    // Next keeps the previous route mounted but hidden, with its own <main>.
    await page.goto("/shell/claim");
    await page.getByRole("link", { name: "Knewt" }).click();
    await expect(page).toHaveURL("/");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await skip.focus();
    await page.keyboard.press("Enter");
    const main = page.getByRole("main");
    await expect(main).toBeFocused();
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test.describe("the greeting", () => {
    test.use({ timezoneId: "Europe/London" });

    test("follows the device clock from the first paint, with no hydration error", async ({
      page,
    }) => {
      // 08:30 in London on Sunday 1 November 2026 (GMT, UTC+0).
      await page.clock.setFixedTime(new Date("2026-11-01T08:30:00Z"));
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Good morning.",
      );
      await expect(page.getByText("Sunday 1 November")).toBeVisible();
      // Any hydration mismatch would surface as a console error here.
      await page.waitForLoadState("networkidle");
    });

    test("is filled on a client navigation to Home as well", async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date("2026-11-01T19:05:00Z"));
      await page.goto("/shell/claim");
      await page.getByRole("link", { name: "Knewt" }).click();
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Good evening.",
      );
    });
  });
});

test.describe("Wave 1 exit (DLY-1 writes these)", () => {
  test.fixme("Quick play from Home runs ten questions to the results screen", () => {});

  test.fixme("one tap on Play opens Mystery 1's first clue with nothing in between", () => {});

  test.fixme("a fixture Daily of three Mysteries and an Encore reaches the stop screen with its share lines in order", () => {});

  test.fixme("reloading mid-Mystery resumes at the same clue with the same guess chips", () => {});

  test.fixme("the [mc ×9, encore] and [mc ×5, mystery, encore] fixture Dailies score out of 9 with collapsed choice rows", () => {});
});
