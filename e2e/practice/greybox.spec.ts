/**
 * Practice greybox (PRA-1): Quick play from Today to the results, on the
 * mock build. A run is untimed and judged on the device; the explanation
 * sheet holds Continue, and a tap on the question completes the reveal at
 * once, which keeps these flows quick.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";

interface TrackedEvent {
  name: string;
  props: Record<string, unknown>;
}

const round = (page: Page) => page.locator('[data-round="choice"]');
const stem = (page: Page) => round(page).getByRole("heading", { level: 1 });
const progress = (page: Page) =>
  page.getByRole("list", { name: /^Question \d+ of \d+\./ });

/** Today's Quick play: the copy on screen (Today renders the card twice). */
function quickPlay(page: Page): Locator {
  return page
    .locator('[data-home-slot="practice"]')
    .getByRole("link", { name: "Quick play" });
}

/** Picks option `option` (0 for A) and waits for the explanation sheet. */
async function answer(page: Page, option = 0) {
  const options = round(page).locator("[data-question] ol").getByRole("button");
  await options.nth(option).click();
  // A tap anywhere completes the automatic part of the reveal at once.
  await stem(page).click();
  await expect(round(page).getByRole("region")).toBeVisible();
}

async function answerAndContinue(page: Page, option = 0) {
  await answer(page, option);
  const next = round(page).getByRole("button", {
    name: /^(Next question|See your results)$/,
  });
  await next.click();
}

async function startQuickPlay(page: Page) {
  await page.goto("/");
  await quickPlay(page).click();
  await expect(page).toHaveURL("/practice/run");
  await expect(stem(page)).toBeVisible();
}

async function trackLog(page: Page): Promise<TrackedEvent[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __qzTrackLog?: TrackedEvent[] }).__qzTrackLog ??
      [],
  );
}

/** Text that looks like a clock: 0:42, 12:05. */
const CLOCK = /\b\d{1,2}:\d{2}\b/;

async function expectNoClock(page: Page) {
  await expect(page.getByRole("timer")).toHaveCount(0);
  const text = await page.locator("header, main").allInnerTexts();
  expect(text.join("\n")).not.toMatch(CLOCK);
}

test.describe("practice greybox", () => {
  test("AC-PRA-01 one tap on Quick play from Today renders question one of a 10-question Mixed run", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(quickPlay(page)).toBeVisible();
    await quickPlay(page).click();

    await expect(page).toHaveURL("/practice/run");
    await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
    await expect(stem(page)).toBeVisible();
    await expect(stem(page)).toBeFocused();
    await expect(
      page.getByRole("list", {
        name: "Question 1 of 10. 0 right, 0 wrong so far.",
      }),
    ).toBeVisible();
    await expect(progress(page).getByRole("listitem")).toHaveCount(10);
    await expect(page.getByRole("banner")).toContainText("Mixed");
    const options = round(page)
      .locator("[data-question] ol")
      .getByRole("button");
    expect(await options.count()).toBeGreaterThanOrEqual(2);

    const started = (await trackLog(page)).filter(
      (event) => event.name === "practice_start",
    );
    expect(started).toEqual([
      {
        name: "practice_start",
        props: { mode: "practice", category: "mixed", difficulty: "mixed" },
      },
    ]);
  });

  test("Quick play runs ten questions to the results, each with its verdict", async ({
    page,
  }) => {
    await startQuickPlay(page);
    for (let question = 1; question <= 10; question += 1) {
      await expect(
        round(page).getByText(`Question ${question} of 10`),
      ).toBeVisible();
      await answerAndContinue(page, question % 2);
    }

    await expect(page).toHaveURL("/practice/results");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText(/^Practice done\. \d+ out of 10\.$/);
    const score = Number(
      /(\d+) out of/.exec((await heading.textContent()) ?? "")?.[1],
    );
    const rows = page.locator("[data-result-row]");
    await expect(rows).toHaveCount(10);
    await expect(page.locator('[data-result-row="right"]')).toHaveCount(score);
    for (let n = 1; n <= 10; n += 1) {
      await expect(rows.nth(n - 1)).toContainText(`Question ${n}`);
      await expect(rows.nth(n - 1)).toContainText(/Right|Not quite/);
      await expect(rows.nth(n - 1)).toContainText("Answer:");
    }
    await expect(
      page.getByRole("button", { name: "Play again" }),
    ).toBeVisible();

    const names = (await trackLog(page)).map((event) => event.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "practice_start",
        "run_complete",
        "results_view",
      ]),
    );
    const complete = (await trackLog(page)).find(
      (event) => event.name === "run_complete",
    );
    expect(complete?.props).toMatchObject({ mode: "practice" });

    // The results replaced the run in the history: Back goes to Today.
    await page.goBack();
    await expect(page).toHaveURL("/");
  });

  test("AC-PRA-11 the practice results screen has no challenge action", async ({
    page,
  }) => {
    await startQuickPlay(page);
    for (let question = 1; question <= 10; question += 1) {
      await answerAndContinue(page);
    }
    await expect(page).toHaveURL("/practice/results");
    await expect(
      page.getByRole("button", { name: "Play again" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /challenge/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /challenge/i })).toHaveCount(0);
    await expect(page.getByText(/challenge/i)).toHaveCount(0);
  });

  test("AC-PRA-12 no clock is visible in Quick Play or category practice", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await expectNoClock(page);
    await answer(page);
    await expectNoClock(page);

    // Category practice: the setup (PRA-2) leaves its request the same way.
    await page.evaluate(() => {
      sessionStorage.setItem(
        "qz:practice-intent",
        JSON.stringify({
          v: 1,
          mode: "category",
          category: "geo",
          difficulty: "mixed",
        }),
      );
    });
    await page.goto("/practice/run");
    await expect(page.getByRole("banner")).toContainText("Geography");
    await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
    await expectNoClock(page);
    await answerAndContinue(page);
    await expectNoClock(page);
  });

  test("a reload resumes the run on the same question, and on the same reveal", async ({
    page,
  }) => {
    await startQuickPlay(page);
    for (let question = 1; question <= 3; question += 1) {
      await answerAndContinue(page, question % 2);
    }
    await expect(round(page).getByText("Question 4 of 10")).toBeVisible();
    const question = await stem(page).textContent();
    const summary = await progress(page).getAttribute("aria-label");

    await page.reload();
    await expect(round(page).getByText("Question 4 of 10")).toBeVisible();
    await expect(stem(page)).toHaveText(question ?? "");
    await expect(progress(page)).toHaveAttribute("aria-label", summary ?? "");

    // Answered but not continued: the reload comes back to the same verdict.
    await answer(page, 1);
    const verdict = await round(page)
      .getByRole("region")
      .getAttribute("aria-labelledby");
    const title = await round(page)
      .getByRole("region")
      .getByRole("heading")
      .textContent();
    expect(verdict).not.toBeNull();
    await page.reload();
    await expect(
      round(page).getByRole("region").getByRole("heading"),
    ).toHaveText(title ?? "");
    await expect(round(page).getByText("Question 4 of 10")).toBeVisible();
    await round(page).getByRole("button", { name: "Next question" }).click();
    await expect(round(page).getByText("Question 5 of 10")).toBeVisible();
  });

  test("keys 1 to 4 answer while the question has focus", async ({ page }) => {
    await startQuickPlay(page);
    await expect(stem(page)).toBeFocused();
    await page.keyboard.press("2");
    const options = round(page)
      .locator("[data-question] ol")
      .getByRole("button");
    await expect(options.nth(1)).toHaveAttribute(
      "data-state",
      /^(locked|correct|your-answer)$/,
    );
    await expect(round(page).getByRole("region")).toBeVisible();
    await expect(
      round(page).getByRole("region").getByRole("heading"),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(round(page).getByText("Question 2 of 10")).toBeVisible();
    await expect(stem(page)).toBeFocused();
  });

  test("Play again starts a new run with the same settings", async ({
    page,
  }) => {
    await startQuickPlay(page);
    for (let question = 1; question <= 10; question += 1) {
      await answerAndContinue(page);
    }
    await expect(page).toHaveURL("/practice/results");
    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page).toHaveURL("/practice/run");
    await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
    await expect(
      page.getByRole("list", {
        name: "Question 1 of 10. 0 right, 0 wrong so far.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Mixed");
  });

  test.describe("at 320 px", () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test("the question, its reveal and the results fit without sideways scrolling", async ({
      page,
    }) => {
      const fits = () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        );
      await startQuickPlay(page);
      expect(await fits()).toBe(true);
      await answer(page, 1);
      expect(await fits()).toBe(true);
      await round(page).getByRole("button", { name: "Next question" }).click();
      for (let question = 2; question <= 10; question += 1) {
        await answerAndContinue(page);
        expect(await fits()).toBe(true);
      }
      await expect(page).toHaveURL("/practice/results");
      await expect(page.locator("[data-result-row]")).toHaveCount(10);
      expect(await fits()).toBe(true);
    });
  });
});
