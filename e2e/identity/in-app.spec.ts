/**
 * In-app browsers on the mock build (PRD §3.10.4, ARCHITECTURE §9.4,
 * IDN-2): each fixture user agent is told apart (AC-IAB-01), Play reaches
 * clue 1 in one tap with no handoff prompt (AC-IAB-02), and no route
 * offers an install, push or calendar control (AC-IAB-05, the checks that
 * apply so far: CAL-1's pitches don't exist yet).
 *
 * AC-IAB-01's `landing_view` is ANA-1's event; until it logs one, the
 * detection shows through what IDN-2 builds on it: inside an in-app
 * browser, /me/sync leads with the claim link and names the app.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";

import {
  IN_APP_FIXTURES,
  SAFARI_IOS,
  WHATSAPP_ANDROID,
  type UserAgentFixture,
} from "../../src/features/identity/__fixtures__/user-agents";
import {
  SHELL_ROUTES,
  type ShellRoute,
} from "../../src/features/shell/shell-routes";
import { expect, test } from "../fixtures";
import { mockInit } from "../support/mock";

const APP_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  telegram: "Telegram",
};

/** Sets the fixture's user agent for the test's own context and page. */
function useFixture(fixture: UserAgentFixture): void {
  test.use({ userAgent: fixture.userAgent });
  if (fixture.telegramObject === true) {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { TelegramWebview: object }).TelegramWebview = {};
      });
    });
  }
}

/** /me/sync for a player who finished today's Daily. */
async function openSyncAfterAFinish(page: Page): Promise<void> {
  await mockInit(page, { scenario: "finished_today" });
  await page.goto("/me/sync");
  await expect(page.locator("[data-sync-screen]")).toBeVisible();
}

test.use({ timezoneId: "Europe/London" });

for (const fixture of IN_APP_FIXTURES) {
  test.describe(fixture.name, () => {
    useFixture(fixture);

    test(`AC-IAB-01 ${fixture.name} is detected as in_app ${fixture.app}`, async ({
      page,
    }) => {
      await openSyncAfterAFinish(page);
      await expect(page.locator("[data-sync-screen]")).toHaveAttribute(
        "data-sync-screen",
        "in-app",
      );
      await expect(
        page.getByRole("heading", {
          name: `Playing inside ${APP_NAMES[fixture.app] ?? ""}?`,
        }),
      ).toBeVisible();
      const detected = await page.evaluate(() => navigator.userAgent);
      expect(detected).toBe(fixture.userAgent);
    });
  });
}

test.describe(SAFARI_IOS.name, () => {
  useFixture(SAFARI_IOS);

  test("AC-IAB-01 Safari on iOS is the system browser", async ({ page }) => {
    await openSyncAfterAFinish(page);
    await expect(page.locator("[data-sync-screen]")).toHaveAttribute(
      "data-sync-screen",
      "browser",
    );
    await expect(
      page.getByRole("heading", { name: /Playing inside/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Show my code" }),
    ).toBeVisible();
  });
});

test.describe("inside WhatsApp", () => {
  useFixture(WHATSAPP_ANDROID);

  test("AC-IAB-02 Play reaches clue 1 in one tap with no handoff prompt", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-daily-card] li").first()).toBeVisible();
    await page.getByRole("link", { name: "Play today's Daily" }).click();
    await expect(
      page.getByRole("heading", { name: /clue 1\b/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/daily$/);
    // No wall, no prompt to switch browsers: nothing but the Daily.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText(/Keep my streak|Open in (browser|Chrome)|Playing inside/),
    ).toHaveCount(0);
  });

  test("AC-IAB-05 no route offers an install, push or calendar control", async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(180_000);
    await mockInit(page, { scenario: "finished_today" });
    const routes = [
      ...builtPages(),
      ...SHELL_ROUTES.filter((route) => route.flag === null).map(shellExample),
    ];
    const pitch = /install|home screen|notification|push|calendar|reminder/i;
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("button", { name: pitch }),
        route,
      ).toHaveCount(0);
      await expect(page.getByRole("link", { name: pitch }), route).toHaveCount(
        0,
      );
    }
    dropNotFoundReports(consoleErrors);
  });
});

/** Every page the build has, with example params (as e2e/identity/cookie.spec.ts walks them). */
function builtPages(): string[] {
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), ".next/app-path-routes-manifest.json"),
      "utf8",
    ),
  ) as Record<string, string>;
  return [...new Set(Object.values(manifest))]
    .filter((path) => !path.startsWith("/api/") && !path.startsWith("/_"))
    .map((path) =>
      path.replace("[number]", "42").replace("[slug]", "geography"),
    )
    .sort();
}

function shellExample(route: ShellRoute): string {
  return route.source
    .replace(":code", "AB12CD34")
    .replace(":token", "kq3Zr0x9TWb7vY4mN2cH8sLp6eJd1gAfUoXiRtBnM5w")
    .replace(
      /:(groupId|roomId|quizId)/,
      "0f8fad5b-d9cb-469f-a165-70867728950e",
    );
}

/** Chromium reports a document's 404 as a failed resource; Beta and unknown pages expect it. */
function dropNotFoundReports(errors: string[]): void {
  for (let index = errors.length - 1; index >= 0; index -= 1) {
    if (errors[index]?.includes("status of 404 (Not Found)")) {
      errors.splice(index, 1);
    }
  }
}
