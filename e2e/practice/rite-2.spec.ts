/**
 * RITE round 2, practice (FIX2-PRA): each finding's reproduction, titled by
 * its id (docs/playtests/rite-2.md, sections 4 to 6; decision D20 in
 * docs/02-PRODUCT-DECISIONS.md §22). Mock build, fixture packs. The
 * content findings (R2-15, R2-22, R2-23) are reproduced where they live:
 * the lint's tests (src/content/pipeline/lint/) and content:dedupe's
 * (scripts/content/).
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

const round = (page: Page) => page.locator('[data-round="choice"]');
const stem = (page: Page) => round(page).getByRole("heading", { level: 1 });
const options = (page: Page) =>
  round(page).locator("[data-question] ol").getByRole("button");
const sheet = (page: Page) => round(page).getByRole("region");
const legend = (page: Page) => round(page).locator("[data-keys-legend]");

async function startQuickPlay(page: Page) {
  await page.goto("/");
  await page
    .locator('[data-home-slot="practice"]')
    .getByRole("link", { name: "Quick play" })
    .click();
  await expect(page).toHaveURL("/practice/run");
  await expect(stem(page)).toBeFocused();
}

/** The legend D20 asks for, for the options on screen. */
async function expectedLegend(page: Page): Promise<string> {
  const count = await options(page).count();
  return count <= 2
    ? "Keys A and B answer."
    : `Keys A to ${count === 3 ? "C" : "D"} answer.`;
}

/** Every option still open: nothing was answered. */
async function expectNothingAnswered(page: Page) {
  const count = await options(page).count();
  for (let i = 0; i < count; i += 1) {
    await expect(options(page).nth(i)).toHaveAttribute("data-state", "idle");
  }
  await expect(sheet(page)).toHaveCount(0);
}

test.describe("RITE round 2: practice", () => {
  test("R2-02 a letter pressed on the question's heading answers nothing; on an option it answers by its letter", async ({
    page,
  }) => {
    await startQuickPlay(page);
    // Sam's repro: "c" with focus on the heading, where the app put it.
    await page.keyboard.press("c");
    // Past the 400 ms beat, so a stray answer would show by now.
    await page.waitForTimeout(600);
    await expectNothingAnswered(page);
    await expect(stem(page)).toBeFocused();
    await expect(legend(page)).toHaveCount(0);

    // From an option the letter answers, by its badge, whatever has focus.
    await page.keyboard.press("Tab");
    await expect(options(page).first()).toBeFocused();
    const count = await options(page).count();
    const [key, pick] = count >= 3 ? ["c", 2] : ["b", 1];
    await page.keyboard.press(key);
    await expect(options(page).nth(pick)).toHaveAttribute(
      "data-state",
      /^(locked|correct|your-answer)$/,
    );
    await expect(sheet(page)).toBeVisible();
    // One key, one answer: the rest stay out of it.
    for (let i = 0; i < count; i += 1) {
      if (i === pick) continue;
      await expect(options(page).nth(i)).toHaveAttribute(
        "data-state",
        /^(correct|dimmed)$/,
      );
    }

    // The next question puts focus on its heading again, where keys do
    // nothing.
    await page.keyboard.press("Enter");
    await expect(round(page).getByText("Question 2 of 10")).toBeVisible();
    await expect(stem(page)).toBeFocused();
    await page.keyboard.press("a");
    await page.waitForTimeout(600);
    await expectNothingAnswered(page);
  });

  test("R2-02 the legend shows under the options after the first key in them, and goes once the answer locks", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await expect(legend(page)).toHaveCount(0);
    // The first key in the options: the Tab that reaches option A.
    await page.keyboard.press("Tab");
    await expect(legend(page)).toBeVisible();
    await expect(legend(page)).toHaveText(await expectedLegend(page));
    // Under the options, inside the question.
    const list = await round(page).locator("[data-question] ol").boundingBox();
    const line = await legend(page).boundingBox();
    expect(list).not.toBeNull();
    expect(line).not.toBeNull();
    if (list !== null && line !== null) {
      expect(line.y).toBeGreaterThanOrEqual(list.y + list.height);
    }
    // It stays while focus moves between the options.
    await page.keyboard.press("Tab");
    await expect(legend(page)).toBeVisible();
    await page.keyboard.press("a");
    await expect(sheet(page)).toBeVisible();
    await expect(legend(page)).toHaveCount(0);
    // A new question starts without it, until a key reaches its options.
    await page.keyboard.press("Enter");
    await expect(round(page).getByText("Question 2 of 10")).toBeVisible();
    await expect(legend(page)).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(legend(page)).toHaveText(await expectedLegend(page));
  });

  test("R2-02 a press that slides off an option leaves no legend: a pointer is not a keyboard", async ({
    page,
  }) => {
    await startQuickPlay(page);
    const box = await options(page).first().boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Chromium hands a pressed button focus, from the pointer.
    await expect(options(page).first()).toBeFocused();
    const heading = await stem(page).boundingBox();
    if (heading !== null) {
      await page.mouse.move(heading.x + 4, heading.y + 4);
    }
    await page.mouse.up();
    await expectNothingAnswered(page);
    await expect(legend(page)).toHaveCount(0);
  });

  test("R2-05 the Practice hub says what is coming soon, not what comes next", async ({
    page,
  }) => {
    await page.goto("/practice");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "Practice",
    );
    await expect(
      main.getByText("Coming soon: choose a category and a difficulty."),
    ).toBeVisible();
    await expect(main).not.toContainText("comes next");
    // Quick play is still the way in.
    await expect(main.getByRole("link", { name: "Quick play" })).toBeVisible();
  });
});
