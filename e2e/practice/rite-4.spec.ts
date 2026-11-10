/**
 * RITE round 4, practice (FIX4-REST): R4-03's reproduction, titled by its
 * id (docs/playtests/rite-4.md, sections 5, 7 and 9; decision D32 in
 * docs/02-PRODUCT-DECISIONS.md §27, and §25's reserved line). Priya, Marcus
 * and Lena read "Keys A to D answer at once." on every question, on phones
 * with no keyboard. Mock build, fixture packs.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

/** A mouse or a trackpad: the media query the app reads (`@/ui/key-legend`). */
const KEYBOARD_LIKELY = "(hover: hover) and (pointer: fine)";

const round = (page: Page) => page.locator('[data-round="choice"]');
const options = (page: Page) =>
  round(page).locator("[data-question] ol").getByRole("button");
const group = (page: Page) => round(page).locator("[data-options]");
/** The legend while it shows, and the line held for it either way. */
const legend = (page: Page) => round(page).locator("[data-keys-legend]");
const keyLine = (page: Page) => round(page).locator("[data-keys-line]");
const sheet = (page: Page) => round(page).getByRole("region");

async function startQuickPlay(page: Page) {
  await page.goto("/");
  await page
    .locator('[data-home-slot="practice"]')
    .getByRole("link", { name: "Quick play" })
    .click();
  await expect(page).toHaveURL("/practice/run");
  await expect(group(page)).toBeFocused();
}

const keyboardLikely = (page: Page) =>
  page.evaluate((query) => window.matchMedia(query).matches, KEYBOARD_LIKELY);

test.describe("R4-03 key legends only for keyboards (D32)", () => {
  test.describe("on a touch-only phone, 390 x 844", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test.beforeEach(async ({ page, browserName }) => {
      // Chromium's touch emulation reports a coarse pointer that can't
      // hover, as a phone does. Elsewhere the engine keeps the desktop's
      // mouse, and the component tests hold the rule.
      test.skip(
        browserName !== "chromium",
        "touch emulation changes the pointer media only in Chromium",
      );
      await startQuickPlay(page);
      expect(await keyboardLikely(page)).toBe(false);
    });

    test("R4-03 with no key pressed, no question says Keys, from the first to the third, and nothing describes the options", async ({
      page,
    }) => {
      for (let n = 1; n <= 3; n += 1) {
        await expect(
          round(page).getByText(`Question ${n} of 10`),
        ).toBeVisible();
        await expect(legend(page)).toHaveCount(0);
        await expect(page.getByText(/Keys A/)).toBeHidden();
        await expect(group(page)).not.toHaveAttribute("aria-describedby");
        // The line is held all the same, unseen.
        await expect(keyLine(page)).toHaveCount(1);
        await expect(keyLine(page)).toHaveCSS("visibility", "hidden");
        await options(page).first().tap();
        await sheet(page)
          .getByRole("button", { name: "Next question" })
          .click();
      }
    });

    test("R4-03 a key press brings the legend into the line it held, and option A's top is unchanged", async ({
      page,
    }) => {
      await expect(legend(page)).toHaveCount(0);
      const line = await keyLine(page).boundingBox();
      const first = await options(page).first().boundingBox();
      const scrolled = await page.evaluate(() => window.scrollY);
      // A hardware key that answers nothing.
      await page.keyboard.press("Shift");
      await expect(legend(page)).toBeVisible();
      await expect(legend(page)).toHaveText(
        /^Keys A (to [CD]|and B) answer at once\.$/,
      );
      expect(await keyLine(page).boundingBox()).toEqual(line);
      expect(await options(page).first().boundingBox()).toEqual(first);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
      // It sits above option A, inside the screen.
      const shown = await legend(page).boundingBox();
      expect(shown).not.toBeNull();
      expect(first).not.toBeNull();
      if (shown === null || first === null) return;
      expect(shown.y + shown.height).toBeLessThanOrEqual(first.y);
      await expect(legend(page)).toBeInViewport({ ratio: 1 });
      // Screen readers hear it as the group's description from now on.
      await expect(group(page)).toHaveAccessibleDescription(
        /^Keys A (to [CD]|and B) answer at once\.$/,
      );
    });

    test("R4-03 once a key has been pressed, the next questions show the legend from the start, and a letter answers", async ({
      page,
    }) => {
      // Lena's mix: a hardware key on a phone. The first letter answers.
      await page.keyboard.press("a");
      await expect(options(page).first()).toHaveAttribute(
        "data-state",
        /^(locked|correct|your-answer)$/,
      );
      await sheet(page).getByRole("button", { name: "Next question" }).click();
      await expect(round(page).getByText("Question 2 of 10")).toBeVisible();
      await expect(legend(page)).toBeVisible();
      await expect(group(page)).toHaveAttribute("aria-describedby", /.+/);
    });
  });

  test.describe("with a mouse or a trackpad", () => {
    test.use({
      viewport: { width: 1280, height: 800 },
      hasTouch: false,
      isMobile: false,
    });

    test("R4-03 D30 the legend still shows from the start, before any key, and the line it sits in is the one a phone holds empty", async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName === "webkit",
        "isMobile can't be turned off for a WebKit phone project",
      );
      await startQuickPlay(page);
      expect(await keyboardLikely(page)).toBe(true);
      await expect(legend(page)).toBeVisible();
      await expect(legend(page)).toHaveText(
        /^Keys A (to [CD]|and B) answer at once\.$/,
      );
      await expect(keyLine(page)).toHaveCSS("visibility", "visible");
      await expect(group(page)).toHaveAccessibleDescription(
        /^Keys A (to [CD]|and B) answer at once\.$/,
      );
    });
  });
});
