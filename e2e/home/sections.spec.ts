/**
 * Today's layout rules that live in CSS (src/features/home/sections.tsx):
 * one notice above Practice at a time, first with content wins, and a
 * promoted Practice card that comes first in the DOM as well as on screen,
 * so keyboard and reading order follow what the player sees. Both Practice
 * slots hold the real Quick play card (PRA-1); the notice slots are stubs
 * until their owners build them, so the test fills those wrappers, and the
 * Daily's, the way the cards will.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

/**
 * Puts `html` first in the wrapper of one home slot, ahead of a card its
 * owner already renders there (the Daily card, since DLY-1), so the
 * injected markup is what reading and focus order meet in that slot.
 */
async function fillSlot(page: Page, slot: string, html: string) {
  await page.evaluate(
    ([name, markup]) => {
      const wrapper = document.querySelector(`[data-home-slot="${name}"]`);
      if (wrapper === null) throw new Error(`no home slot ${name}`);
      wrapper.insertAdjacentHTML("afterbegin", markup);
    },
    [slot, html] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("only the first notice with content shows above Practice", async ({
  page,
}) => {
  await fillSlot(page, "restore-notice", "<p>Welcome back, Plucky Otter.</p>");
  await expect(page.getByText("Welcome back, Plucky Otter.")).toBeVisible();

  await fillSlot(page, "streak-notice", "<p>A freeze covered Tuesday.</p>");
  await expect(page.getByText("A freeze covered Tuesday.")).toBeVisible();
  await expect(page.getByText("Welcome back, Plucky Otter.")).toBeHidden();

  await fillSlot(page, "archive", "<p>Repair your 23-day streak.</p>");
  await expect(page.getByText("Repair your 23-day streak.")).toBeVisible();
  await expect(page.getByText("A freeze covered Tuesday.")).toBeHidden();
  await expect(page.getByText("Welcome back, Plucky Otter.")).toBeHidden();
});

test("a promoted Practice card comes before the Daily in reading order, not only on screen", async ({
  page,
}) => {
  await fillSlot(page, "daily", '<a href="/daily">Play</a>');

  const quickPlay = page.getByRole("link", { name: "Quick play" });
  const play = page.getByRole("link", { name: "Play", exact: true });
  // Not promoted: one Quick play, below the Daily.
  await expect(quickPlay).toHaveCount(1);
  await expect(
    page.locator('[data-home-slot="practice-promoted"]'),
  ).toBeHidden();
  const follows = async () =>
    play.evaluate(
      (daily, quick) =>
        Boolean(
          daily.compareDocumentPosition(quick as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      await quickPlay.elementHandle(),
    );
  expect(await follows()).toBe(true);

  // The Daily card's offline state promotes Practice.
  await fillSlot(page, "daily", '<p data-home-promote="practice">Offline</p>');
  await expect(quickPlay).toHaveCount(1);
  await expect(page.locator('[data-home-slot="practice"]')).toBeHidden();
  expect(await follows()).toBe(false);
  // On screen too: above the Daily, or to its left where the two share a
  // row (from 1024 px, while Today's right column is still empty, R1-35).
  const [practiceBox, dailyBox] = await Promise.all([
    page.locator('[data-home-slot="practice-promoted"]').boundingBox(),
    page.locator('[data-home-slot="daily"]').boundingBox(),
  ]);
  if (practiceBox === null || dailyBox === null) throw new Error("slot boxes");
  const sameRow = Math.abs(practiceBox.y - dailyBox.y) < 1;
  expect(
    sameRow ? practiceBox.x < dailyBox.x : practiceBox.y < dailyBox.y,
  ).toBe(true);

  // Keyboard order agrees: from the Daily's link, Shift+Tab reaches Quick play.
  await play.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(quickPlay).toBeFocused();
});
