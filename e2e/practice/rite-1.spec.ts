/**
 * RITE round 1, practice (FIX-PRA): each finding's reproduction, titled by
 * its id (docs/playtests/rite-1.md, sections 4 and 5; decisions D6, D12
 * and D13 in docs/02-PRODUCT-DECISIONS.md §19). Mock build, fixture packs.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";

const round = (page: Page) => page.locator('[data-round="choice"]');
const stem = (page: Page) => round(page).getByRole("heading", { level: 1 });
const options = (page: Page) =>
  round(page).locator("[data-question] ol").getByRole("button");
const sheet = (page: Page) => round(page).getByRole("region");
const continueButton = (page: Page) =>
  sheet(page).getByRole("button", {
    name: /^(Next question|See your results)$/,
  });
const leave = (page: Page) =>
  page.getByRole("link", { name: "Leave practice" });

/** Today's Practice card, the copy on screen (Today renders it twice). */
const todayCard = (page: Page): Locator =>
  page.locator('[data-home-slot="practice"]');

async function startQuickPlay(page: Page) {
  await page.goto("/");
  await todayCard(page).getByRole("link", { name: "Quick play" }).click();
  await expect(page).toHaveURL("/practice/run");
  await expect(stem(page)).toBeVisible();
}

/** A category run, as PRA-2's setup will leave it (§1.4 item 10). */
async function startRun(
  page: Page,
  category: string,
  difficulty: "easy" | "medium" | "hard" | "mixed",
) {
  await page.goto("/");
  await page.evaluate(
    ([c, d]) =>
      sessionStorage.setItem(
        "qz:practice-intent",
        JSON.stringify({ v: 1, mode: "category", category: c, difficulty: d }),
      ),
    [category, difficulty],
  );
  await page.goto("/practice/run");
  await expect(stem(page)).toBeVisible();
}

/** Picks option `option`, waits for its verdict, then taps the stem to bring the sheet at once. */
async function answer(page: Page, option = 0) {
  await options(page).nth(option).click();
  await expect(options(page).nth(option)).toHaveAttribute(
    "data-state",
    /^(correct|your-answer)$/,
  );
  await stem(page).click();
  await expect(sheet(page)).toBeVisible();
}

async function answerAndContinue(page: Page, option = 0) {
  await answer(page, option);
  await continueButton(page).click();
}

/** Plays a run to its results, answering by `pick`; returns each question's stem. */
async function playToResults(
  page: Page,
  pick: (n: number) => number = (n) => n % 2,
): Promise<string[]> {
  const stems: string[] = [];
  for (let n = 1; n <= 10; n += 1) {
    await expect(round(page).getByText(`Question ${n} of 10`)).toBeVisible();
    stems.push((await stem(page).textContent()) ?? "");
    await answerAndContinue(page, pick(n));
  }
  await expect(page).toHaveURL("/practice/results");
  return stems;
}

/** The bottom of the sticky header, and boxes of the round, in viewport pixels. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const header = [...document.querySelectorAll("header")].find(
      (h) => h.getBoundingClientRect().height > 0,
    );
    const root = document.querySelector('[data-round="choice"]');
    const box = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };
    const content = [
      root?.querySelector("[data-question] p"),
      root?.querySelector("h1"),
      ...(root?.querySelectorAll("[data-question] li") ?? []),
      root?.querySelector('[data-sheet="inline"]'),
    ]
      .map(box)
      .filter((b): b is { top: number; bottom: number } => b !== null);
    return {
      headerBottom: header?.getBoundingClientRect().bottom ?? 0,
      innerHeight,
      scrollY,
      question: box(root?.querySelector("[data-question]")),
      stem: box(root?.querySelector("h1")),
      options: [...(root?.querySelectorAll("[data-question] li") ?? [])].map(
        (li) => li.getBoundingClientRect().top + scrollY,
      ),
      content,
    };
  });
}

/** Empty space between the header's bottom and the first content under it. */
function bandUnderHeader(view: Awaited<ReturnType<typeof layout>>): number {
  const below = view.content
    .filter((b) => b.bottom > view.headerBottom)
    .sort((a, b) => a.top - b.top)[0];
  return below === undefined ? Infinity : below.top - view.headerBottom;
}

async function expectContinueOnScreen(page: Page) {
  const box = await continueButton(page).boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  if (box === null || viewport === null) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test.describe("RITE round 1: practice", () => {
  test("R1-02 the Practice tab opens a practice page inside the tabs layout, with Quick play", async ({
    page,
  }) => {
    await page.goto("/");
    const tabs = page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true });
    await tabs.getByRole("link", { name: "Practice" }).click();
    await expect(page).toHaveURL("/practice");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Practice",
    );
    await expect(page.getByText("This page could not be found")).toHaveCount(0);
    // The tab bar stays, with Practice as the page you're on.
    await expect(tabs.getByRole("link", { name: "Practice" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("main").getByRole("link", { name: "Go to Today" }),
    ).toBeVisible();

    // A cold load is a page too, never the framework's 404.
    const response = await page.goto("/practice");
    expect(response?.status()).toBe(200);
    await page
      .getByRole("main")
      .getByRole("link", { name: "Quick play" })
      .click();
    await expect(page).toHaveURL("/practice/run");
    await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
  });

  test.describe("at 640 by 400 (200% zoom on 1280 by 800)", () => {
    test.use({ viewport: { width: 640, height: 400 } });

    test("R1-12 every new question opens with its top below the sticky header, focus on its stem", async ({
      page,
    }) => {
      await startQuickPlay(page);
      for (let n = 1; n <= 10; n += 1) {
        await expect(
          round(page).getByText(`Question ${n} of 10`),
        ).toBeVisible();
        await expect(stem(page)).toBeFocused();
        const view = await layout(page);
        // "Question N of 10" and the stem's first line are never under it.
        expect(view.question?.top, `question ${n}`).toBeGreaterThanOrEqual(
          view.headerBottom,
        );
        await answerAndContinue(page, n % 2);
      }
      await expect(page).toHaveURL("/practice/results");
    });

    test("R1-31 the compact sheet shows the whole explanation, with Learn more and no Read more", async ({
      page,
    }) => {
      await startQuickPlay(page);
      for (let n = 1; n <= 3; n += 1) {
        await answer(page, n % 2);
        await expectWholeExplanation(page);
        await continueButton(page).click();
      }
    });
  });

  test("R1-13 letters A to D pick; digits pick only when no option is a number", async ({
    page,
  }) => {
    // Medium Geography holds the bridges question (2, 4, 9, 15) and four
    // with words for options.
    await startRun(page, "geo", "medium");
    const total = Number(
      /of (\d+)/.exec(
        (await round(page)
          .getByText(/^Question 1 of \d+/)
          .textContent()) ?? "",
      )?.[1],
    );
    let bridges = false;
    let letterOnWords = false;
    let digitOnWords = false;
    for (let n = 1; n <= total; n += 1) {
      await expect(
        round(page).getByText(`Question ${n} of ${total}`),
      ).toBeVisible();
      await expect(stem(page)).toBeFocused();
      // The labels alone: no badge, and no key hint beside them.
      const labels = await options(page).evaluateAll((buttons) =>
        buttons.map((button) => {
          const copy = button.cloneNode(true) as HTMLElement;
          for (const hint of copy.querySelectorAll("kbd, [aria-hidden]")) {
            hint.remove();
          }
          return copy.textContent ?? "";
        }),
      );
      const numeric = labels.some((label) => /\d/.test(label));
      // Each option names the keys that pick it: no digit on a number question.
      expect(
        await options(page).first().getAttribute("aria-keyshortcuts"),
      ).toBe(numeric ? "A" : "A 1");
      let key = "a";
      let expected = 0;
      const onBridges = /bridges/.test((await stem(page).textContent()) ?? "");
      if (onBridges) {
        // "4" meant four bridges: it must not lock in D, which is 15.
        await page.keyboard.press("4");
        await page.waitForTimeout(500);
        for (let i = 0; i < labels.length; i += 1) {
          await expect(options(page).nth(i)).toHaveAttribute(
            "data-state",
            "idle",
          );
        }
        key = "b";
        expected = 1;
        bridges = true;
      } else if (!numeric && labels.length >= 3) {
        // Words: the letter and the digit both reach option C.
        key = letterOnWords ? "3" : "c";
        expected = 2;
        if (letterOnWords) digitOnWords = true;
        letterOnWords = true;
      }
      await page.keyboard.press(key);
      await expect(options(page).nth(expected)).toHaveAttribute(
        "data-state",
        /^(locked|correct|your-answer)$/,
      );
      if (onBridges) {
        // B is 4, the answer.
        await expect(options(page).nth(1)).toHaveAttribute(
          "data-state",
          "correct",
        );
      }
      // The sheet rises by itself; Enter on its title continues.
      await expect(sheet(page)).toBeVisible();
      await page.keyboard.press("Enter");
    }
    expect(bridges).toBe(true);
    expect(letterOnWords && digitOnWords).toBe(true);
  });

  test("R1-14 after a keyboard answer, Shift+Tab to Leave keeps focus there, and Enter leaves", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await expect(stem(page)).toBeFocused();
    await page.keyboard.press("a");
    // Within 300 ms of the answer.
    await page.keyboard.press("Shift+Tab");
    await expect(leave(page)).toBeFocused();
    await page.waitForTimeout(1500);
    await expect(sheet(page)).toBeVisible();
    await expect(leave(page)).toBeFocused();
    // The verdict reached the status region all the same.
    expect(
      await page.evaluate(
        () => document.getElementById("qz-live-polite")?.textContent ?? "",
      ),
    ).toMatch(/^(Correct|Not quite)\./);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/");
  });

  test("R1-15 Today's Practice card and /practice promise nothing about offline play", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(todayCard(page)).toContainText("Ten questions on anything.");
    await expect(todayCard(page)).not.toContainText(/offline/i);
    await page.goto("/practice");
    await expect(page.getByRole("main")).not.toContainText(/offline/i);
    // Nothing in this build registers a service worker yet (PWA-1 will).
    expect(
      await page.evaluate(async () =>
        "serviceWorker" in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : 0,
      ),
    ).toBe(0);
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    test.describe(`at ${viewport.width} by ${viewport.height}`, () => {
      test.use({ viewport });

      test("R1-21 the reveal takes its room without moving the options or leaving a blank band under the header", async ({
        page,
      }) => {
        await startQuickPlay(page);
        for (let n = 1; n <= 4; n += 1) {
          await expect(
            round(page).getByText(`Question ${n} of 10`),
          ).toBeVisible();
          const picked = options(page).nth(n % 2);
          await picked.click();
          // Locked in and revealed: the options have closed up under the stem.
          await expect(picked).toHaveAttribute(
            "data-state",
            /^(correct|your-answer)$/,
          );
          const atVerdict = await layout(page);
          // No tap: the sheet rises by itself at 1.2 s.
          await expect(sheet(page)).toBeVisible();
          const withSheet = await layout(page);
          // Nothing above the sheet moved on the page.
          expect(withSheet.options, `question ${n}`).toEqual(atVerdict.options);
          // Whatever scrolled, the question or its options sit right under
          // the header: no empty band "like the page broke".
          expect(bandUnderHeader(withSheet), `question ${n}`).toBeLessThan(24);
          if (viewport.height >= 740) {
            // On a tall phone the question itself stays in view.
            expect(withSheet.stem?.bottom ?? 0).toBeGreaterThan(
              withSheet.headerBottom,
            );
          }
          await expectContinueOnScreen(page);
          await continueButton(page).click();
        }
      });
    });
  }

  test.describe("at 360 by 640", () => {
    test.use({ viewport: { width: 360, height: 640 } });

    test("R1-31 the compact sheet shows the whole explanation on a short phone", async ({
      page,
    }) => {
      await startQuickPlay(page);
      for (let n = 1; n <= 3; n += 1) {
        await answer(page, n % 2);
        await expectWholeExplanation(page);
        await continueButton(page).click();
      }
    });
  });

  test("R1-25 the sheet puts a guild mid-sentence, and the Old Wall's years all carry their era", async ({
    page,
  }) => {
    // Easy History: four questions, the glaziers' guild among them.
    await startRun(page, "hist", "easy");
    let guild = false;
    for (let n = 1; n <= 4 && !guild; n += 1) {
      if (/guild/i.test((await stem(page).textContent()) ?? "")) {
        await answer(page, 0);
        await expect(sheet(page).getByRole("heading")).toHaveAccessibleName(
          /^(Right|Not quite)\. It's the Glaziers' Guild\.$/,
        );
        guild = true;
      } else {
        await answerAndContinue(page, 0);
      }
    }
    expect(guild).toBe(true);

    // Hard Geography: its three Hard items, the Old Wall among them.
    await startRun(page, "geo", "hard");
    let wall = false;
    for (let n = 1; n <= 10 && !wall; n += 1) {
      if (/Old Wall/.test((await stem(page).textContent()) ?? "")) {
        // Ascending, as the item asks; every year with its era.
        for (const [i, name] of [
          "A. 300 BC",
          "B. 120 BC",
          "C. AD 45",
          "D. AD 210",
        ].entries()) {
          await expect(options(page).nth(i)).toHaveAccessibleName(name);
        }
        wall = true;
      } else {
        await answerAndContinue(page, 0);
      }
    }
    expect(wall).toBe(true);
  });

  test("R1-34 the reveal's heading and the results' score read without stray spaces", async ({
    page,
  }) => {
    await startQuickPlay(page);
    for (let n = 1; n <= 10; n += 1) {
      await expect(round(page).getByText(`Question ${n} of 10`)).toBeVisible();
      await answer(page, n % 2);
      const heading = sheet(page).getByRole("heading");
      await expect(heading).toHaveAccessibleName(
        /^(Right|Not quite)\. It's \S.*\S\.$/,
      );
      await expect(heading).not.toHaveAccessibleName(/ \.|  /);
      await continueButton(page).click();
    }
    await expect(page).toHaveURL("/practice/results");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      /^Practice done\. \d+ out of 10\.$/,
    );
  });

  test("R1-36 Play again keeps the last run's questions out of the next", async ({
    page,
  }) => {
    await startQuickPlay(page);
    const first = await playToResults(page);
    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page).toHaveURL("/practice/run");
    const second = await playToResults(page);
    expect(second.filter((text) => first.includes(text))).toEqual([]);
  });

  test("R1-36 while a run is open, Quick play reads Continue practice · 3 of 10 and carries it on", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await answerAndContinue(page, 0);
    await answerAndContinue(page, 1);
    await expect(round(page).getByText("Question 3 of 10")).toBeVisible();
    const third = await stem(page).textContent();
    await leave(page).click();
    await expect(page).toHaveURL("/");

    const resume = todayCard(page).getByRole("link", {
      name: "Continue practice · 3 of 10",
    });
    await expect(resume).toBeVisible();
    await resume.click();
    await expect(page).toHaveURL("/practice/run");
    await expect(round(page).getByText("Question 3 of 10")).toBeVisible();
    await expect(stem(page)).toHaveText(third ?? "");

    // The hub says the same, on a cold load.
    await page.goto("/practice");
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: "Continue practice · 3 of 10" }),
    ).toBeVisible();
  });

  test("R1-17 results rows carry a short stem and, on a miss, what the player chose; Play again sits above them", async ({
    page,
  }) => {
    await startQuickPlay(page);
    const stems = await playToResults(page);
    const rows = page.locator("[data-result-row]");
    await expect(rows).toHaveCount(10);
    for (const [i, text] of stems.entries()) {
      const row = rows.nth(i);
      await expect(row.locator("[data-result-stem]")).toHaveText(
        `${i + 1}. ${text}`,
      );
      await expect(row).toContainText("Answer:");
      if ((await row.getAttribute("data-result-row")) === "wrong") {
        await expect(row).toContainText(/You chose \S/);
      } else {
        await expect(row).not.toContainText("You chose");
      }
    }
    const again = await page
      .getByRole("button", { name: "Play again" })
      .boundingBox();
    const firstRow = await rows.first().boundingBox();
    const viewport = page.viewportSize();
    expect(again).not.toBeNull();
    expect(firstRow).not.toBeNull();
    if (again === null || firstRow === null || viewport === null) return;
    expect(again.y).toBeLessThan(firstRow.y);
    // On the first screen, with no scrolling.
    expect(again.y + again.height).toBeLessThanOrEqual(viewport.height);
  });
});

/** D12: the explanation whole on screen (not clamped, nothing behind Read more), with Learn more and Continue. */
async function expectWholeExplanation(page: Page) {
  await expect(
    sheet(page).getByRole("button", { name: "Read more" }),
  ).toHaveCount(0);
  const explanation = sheet(page).locator("[data-explanation]");
  const fit = await explanation.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const header = [...document.querySelectorAll("header")].find(
      (h) => h.getBoundingClientRect().height > 0,
    );
    // Inside the sheet's own scroller, when it has one.
    const scroller = el.closest<HTMLElement>("[data-sheet-body]");
    const clip =
      scroller?.style.overflowY === "auto"
        ? scroller.getBoundingClientRect()
        : null;
    return {
      clamped: el.scrollHeight > el.clientHeight + 1,
      top: box.top,
      bottom: box.bottom,
      headerBottom: header?.getBoundingClientRect().bottom ?? 0,
      innerHeight,
      scrolls: clip !== null,
    };
  });
  expect(fit.clamped).toBe(false);
  if (!fit.scrolls) {
    expect(fit.top).toBeGreaterThanOrEqual(fit.headerBottom - 1);
    expect(fit.bottom).toBeLessThanOrEqual(fit.innerHeight + 1);
  }
  await expect(
    sheet(page).getByRole("link", { name: /^Learn more about / }),
  ).toBeAttached();
  await expectContinueOnScreen(page);
}
