/**
 * Practice greybox (PRA-1): Quick play from Today to the results, on the
 * mock build. A run is untimed and judged on the device. Each verdict shows
 * 400 ms after the pick, in the options and the header together; a tap
 * then completes the reveal at once, which keeps these flows quick, and the
 * explanation sheet holds Continue.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";

interface TrackedEvent {
  name: string;
  props: Record<string, unknown>;
}

const round = (page: Page) => page.locator('[data-round="choice"]');
const stem = (page: Page) => round(page).getByRole("heading", { level: 1 });
const options = (page: Page) =>
  round(page).locator("[data-question] ol").getByRole("button");
const progress = (page: Page) =>
  page.getByRole("list", { name: /^Question \d+ of \d+\./ });
const continueButton = (page: Page) =>
  round(page).getByRole("button", {
    name: /^(Next question|See your results)$/,
  });

/** Today's Quick play: the copy on screen (Today renders the card twice). */
function quickPlay(page: Page): Locator {
  return page
    .locator('[data-home-slot="practice"]')
    .getByRole("link", { name: "Quick play" });
}

/**
 * Picks option `option` (0 for A), waits for its verdict (400 ms after the
 * pick), then taps the question, which completes the reveal at once, and
 * waits for the explanation sheet.
 */
async function answer(page: Page, option = 0) {
  await options(page).nth(option).click();
  await expect(options(page).nth(option)).toHaveAttribute(
    "data-state",
    /^(correct|your-answer)$/,
  );
  await stem(page).click();
  await expect(round(page).getByRole("region")).toBeVisible();
}

async function answerAndContinue(page: Page, option = 0) {
  await answer(page, option);
  await continueButton(page).click();
}

async function startQuickPlay(page: Page) {
  await page.goto("/");
  await quickPlay(page).click();
  await expect(page).toHaveURL("/practice/run");
  await expect(stem(page)).toBeVisible();
}

async function playToResults(page: Page) {
  for (let question = 1; question <= 10; question += 1) {
    await expect(
      round(page).getByText(`Question ${question} of 10`),
    ).toBeVisible();
    await answerAndContinue(page, question % 2);
  }
  await expect(page).toHaveURL("/practice/results");
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

/** No sideways scrolling: the page is no wider than the viewport. */
async function expectFits(page: Page, where: string) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll, `${where}: page width`).toBeLessThanOrEqual(
    widths.client,
  );
}

/** Continue fully on screen, so nobody has to find it by scrolling. */
async function expectContinueOnScreen(page: Page, where: string) {
  const viewport = page.viewportSize();
  const box = await continueButton(page).boundingBox();
  expect(box, `${where}: Continue`).not.toBeNull();
  if (box === null || viewport === null) return;
  expect(box.y, `${where}: Continue's top`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${where}: Continue's bottom`).toBeLessThanOrEqual(
    viewport.height,
  );
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
    expect(await options(page).count()).toBeGreaterThanOrEqual(2);

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

  test("the header holds each verdict until the options show it, 400 ms after the pick", async ({
    page,
  }) => {
    await startQuickPlay(page);
    for (let question = 1; question <= 3; question += 1) {
      await expect(
        round(page).getByText(`Question ${question} of 10`),
      ).toBeVisible();
      await page.evaluate((index) => {
        const segment = document.querySelectorAll(
          'header ol[data-variant="bar"] li',
        )[index];
        const list = document.querySelector('header ol[data-variant="bar"]');
        const picked = document.querySelector(
          '[data-round="choice"] [data-question] ol button',
        );
        if (!segment || !list || !picked) throw new Error("probe targets");
        const label = list.getAttribute("aria-label");
        const probe = {
          click: null as number | null,
          shown: null as number | null,
          early: [] as string[],
        };
        (window as unknown as { __beat: typeof probe }).__beat = probe;
        picked.addEventListener(
          "click",
          () => {
            probe.click ??= performance.now();
          },
          { capture: true },
        );
        new MutationObserver(() => {
          const state = picked.getAttribute("data-state");
          const shown = state === "correct" || state === "your-answer";
          if (shown) probe.shown ??= performance.now();
          if (shown) return;
          // The verdict may not reach the header before it reaches the options.
          const status = segment.getAttribute("data-status");
          if (status !== "upcoming") probe.early.push(`segment ${status}`);
          const now = list.getAttribute("aria-label");
          if (now !== label) probe.early.push(`label ${now}`);
        }).observe(document.body, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-status", "data-state", "aria-label"],
        });
      }, question - 1);

      await options(page).first().click();
      // No tap: the sheet rises by itself at 1.2 s.
      await expect(round(page).getByRole("region")).toBeVisible();
      const probe = await page.evaluate(
        () =>
          (
            window as unknown as {
              __beat: {
                click: number | null;
                shown: number | null;
                early: string[];
              };
            }
          ).__beat,
      );
      expect(probe.early).toEqual([]);
      expect(probe.click).not.toBeNull();
      expect(probe.shown).not.toBeNull();
      // PRD §3.0.3: the reveal at 400 ms, timed from the commit on click.
      expect((probe.shown ?? 0) - (probe.click ?? 0)).toBeGreaterThan(380);
      await expect(
        progress(page)
          .getByRole("listitem")
          .nth(question - 1),
      ).toHaveAttribute("data-status", /^(correct|wrong)$/);
      await continueButton(page).click();
    }
  });

  test("Quick play runs ten questions to the results, each with its verdict", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await playToResults(page);

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText(/^Practice done\. \d+ out of 10\.$/);
    const score = Number(
      /(\d+) out of/.exec((await heading.textContent()) ?? "")?.[1],
    );
    const rows = page.locator("[data-result-row]");
    await expect(rows).toHaveCount(10);
    await expect(page.locator('[data-result-row="right"]')).toHaveCount(score);
    for (let n = 1; n <= 10; n += 1) {
      // D13: each row's number and stem, its verdict and the answer.
      await expect(rows.nth(n - 1)).toContainText(`${n}. `);
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

  test("the results take focus on their heading, drop the last verdict and name every row", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await playToResults(page);
    // Continue went with the run; focus lands on the score, the page's heading.
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    // The run's last verdict doesn't linger in the status region.
    const polite = await page.evaluate(
      () => document.getElementById("qz-live-polite")?.textContent ?? "",
    );
    expect(polite).toBe("");
    // Each row opens with a summary of its own: no ten controls named "Why".
    const summaries = await page
      .locator("[data-result-row] summary")
      .allInnerTexts();
    expect(summaries).toHaveLength(10);
    expect(new Set(summaries).size).toBe(10);
    for (const [i, text] of summaries.entries()) {
      expect(text.startsWith(`${i + 1}. `)).toBe(true);
    }
    // A row opens to its question and explanation.
    const first = page.locator("[data-result-row] details").first();
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
  });

  test("AC-PRA-11 the practice results screen has no challenge action", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await playToResults(page);
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
    expect(title).toMatch(/^(Right|Not quite)\./);
    await page.reload();
    await expect(
      round(page).getByRole("region").getByRole("heading"),
    ).toHaveText(title ?? "");
    await expect(round(page).getByText("Question 4 of 10")).toBeVisible();
    await round(page).getByRole("button", { name: "Next question" }).click();
    await expect(round(page).getByText("Question 5 of 10")).toBeVisible();
  });

  test("keys A to D answer while the question has focus", async ({ page }) => {
    await startQuickPlay(page);
    await expect(stem(page)).toBeFocused();
    // The letters always pick (D6); the digits only when no option is a
    // number, which e2e/practice/rite-1.spec.ts covers.
    await page.keyboard.press("b");
    await expect(options(page).nth(1)).toHaveAttribute(
      "data-state",
      /^(locked|correct|your-answer)$/,
    );
    await expect(round(page).getByRole("region")).toBeVisible();
    const title = round(page).getByRole("region").getByRole("heading");
    await expect(title).toBeFocused();
    // The focused heading says the verdict first.
    await expect(title).toHaveText(/^(Right|Not quite)\./);
    await page.keyboard.press("Enter");
    await expect(round(page).getByText("Question 2 of 10")).toBeVisible();
    await expect(stem(page)).toBeFocused();
  });

  test("Play again starts a new run with the same settings, and Back from its results reaches Today", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await playToResults(page);
    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page).toHaveURL("/practice/run");
    await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
    await expect(
      page.getByRole("list", {
        name: "Question 1 of 10. 0 right, 0 wrong so far.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Mixed");

    // Run 2's results replaced run 1's: one Back still goes to Today.
    await playToResults(page);
    await page.goBack();
    await expect(page).toHaveURL("/");
  });

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 390, height: 844 },
  ]) {
    test.describe(`at ${viewport.width} by ${viewport.height}`, () => {
      test.use({ viewport });

      test("Continue is on screen after every answer, and nothing scrolls sideways", async ({
        page,
      }) => {
        await startQuickPlay(page);
        await expectFits(page, "question 1");
        for (let question = 1; question <= 10; question += 1) {
          await answer(page, question % 2);
          await expectContinueOnScreen(page, `question ${question}`);
          await expectFits(page, `question ${question}, revealed`);
          await continueButton(page).click();
          if (question < 10) await expectFits(page, `question ${question + 1}`);
        }
        await expect(page).toHaveURL("/practice/results");
        await expect(page.locator("[data-result-row]")).toHaveCount(10);
        await expectFits(page, "results");
      });

      test("the answers sit in the lower part of the screen, in the same place each question", async ({
        page,
      }) => {
        await startQuickPlay(page);
        const bottoms: number[] = [];
        for (let question = 1; question <= 4; question += 1) {
          const last = options(page).last();
          const box = await last.boundingBox();
          expect(box).not.toBeNull();
          if (box !== null) bottoms.push(Math.round(box.y + box.height));
          const first = await options(page).first().boundingBox();
          // PRD §3.0.3: the answers in the lower 55% of a phone's screen.
          expect(first?.y ?? 0).toBeGreaterThanOrEqual(viewport.height * 0.35);
          await answerAndContinue(page, question % 2);
        }
        // The last option's bottom edge stays put from one question to the next.
        expect(new Set(bottoms).size).toBe(1);
      });
    });
  }

  test.describe("at 320 px and 200% text", () => {
    test.use({ viewport: { width: 320, height: 640 } });

    async function startAt200(page: Page) {
      await page.goto("/");
      // The run is reached by client-side navigation, so the style holds.
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await quickPlay(page).click();
      await expect(page).toHaveURL("/practice/run");
      await expect(stem(page)).toBeVisible();
    }

    test("the header, every question and the results fit without sideways scrolling", async ({
      page,
    }) => {
      await startAt200(page);
      for (let question = 1; question <= 10; question += 1) {
        await expect(
          round(page).getByText(`Question ${question} of 10`),
        ).toBeVisible();
        await expectFits(page, `question ${question} at 200%`);
        const picked = options(page).nth(question % 2);
        await picked.click();
        await expect(picked).toHaveAttribute(
          "data-state",
          /^(correct|your-answer)$/,
        );
        // By keyboard from here: Enter completes the reveal, then continues.
        await page.keyboard.press("Enter");
        await expect(round(page).getByRole("region")).toBeVisible();
        await page.keyboard.press("Enter");
      }
      await expect(page).toHaveURL("/practice/results");
      await expect(page.locator("[data-result-row]")).toHaveCount(10);
      await expectFits(page, "results at 200%");
    });

    // DS-1's AnswerButton puts a revealed option's tag beside its name
    // only where the name leaves room, else under it, so at 200% text the
    // tag never makes the option wider than the screen (R1-36).
    test("every reveal fits without sideways scrolling", async ({ page }) => {
      await startAt200(page);
      for (let question = 1; question <= 10; question += 1) {
        await answer(page, question % 2);
        await expectFits(page, `question ${question} revealed at 200%`);
        await page.keyboard.press("Enter");
      }
    });
  });
});
