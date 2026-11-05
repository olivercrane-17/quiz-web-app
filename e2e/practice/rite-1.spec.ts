/**
 * RITE round 1, practice (FIX-PRA): each finding's reproduction, titled by
 * its id (docs/playtests/rite-1.md, sections 4 and 5; decisions D6, D12
 * and D13 in docs/02-PRODUCT-DECISIONS.md §19). Mock build, fixture packs.
 */
import { devices, type Locator, type Page } from "@playwright/test";

import { MIN_SHEET_BODY_PX } from "../../src/features/rounds/choice/viewport";
import { expect, test } from "../fixtures";
import { allowClipboard } from "../support/clipboard";
import { mockInit } from "../support/mock";

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

/**
 * Waits out the sheet's rise (360 ms from below, DESIGN §7.3). Continue is
 * on screen once the sheet has risen, and below the fold for its first
 * frames, which a slow runner can still be in when it measures.
 */
async function sheetRisen(page: Page) {
  await sheet(page).evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
}

async function expectContinueOnScreen(page: Page) {
  const box = await continueButton(page).boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  if (box === null || viewport === null) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

/**
 * DESIGN §6.10, R1-21: with the sheet open, the correct option and the pick
 * lie whole between the header and the bottom of the screen, whenever the
 * screen holds them both above the sheet with its body at its floor. Four
 * two-line options on a 640 px screen can't, and then only Continue and the
 * title are sure to show.
 */
async function expectMarkedOptionsOnScreen(page: Page, label: string) {
  const view = await page.evaluate((floor) => {
    const header = [...document.querySelectorAll("header")].find(
      (h) => h.getBoundingClientRect().height > 0,
    );
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    const root = document.querySelector('[data-round="choice"]');
    const marked = [
      ...(root?.querySelectorAll(
        '[data-question] [data-state="correct"], [data-question] [data-state="your-answer"]',
      ) ?? []),
    ].map((option) => {
      const box = option.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    });
    const sheet = root
      ?.querySelector('[data-sheet="inline"]')
      ?.getBoundingClientRect();
    const body = root?.querySelector("[data-sheet-body]");
    // How much shorter the sheet could still get: its body down to the floor.
    const give = Math.max(0, (body?.clientHeight ?? 0) - floor);
    const highest = Math.min(...marked.map((box) => box.top));
    return {
      headerBottom,
      innerHeight,
      marked,
      roomForBoth:
        sheet !== undefined &&
        sheet.bottom - give - highest <= innerHeight - headerBottom,
    };
  }, MIN_SHEET_BODY_PX);
  expect(view.marked.length, label).toBeGreaterThan(0);
  if (!view.roomForBoth) return;
  for (const box of view.marked) {
    expect(box.top, label).toBeGreaterThanOrEqual(view.headerBottom - 0.5);
    expect(box.bottom, label).toBeLessThanOrEqual(view.innerHeight + 0.5);
  }
}

/** 200% text, as a phone's text size setting gives it (Chromium only: tag the test @cdp). */
async function textAt200(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", {
    fontSizes: { standard: 32, fixed: 26 },
  });
}

/** Answers with a letter key, then continues from the sheet with Enter: a keyboard works at any size. */
async function answerByKey(page: Page, key: string) {
  await page.keyboard.press(key);
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("Enter");
}

/** Plays two questions and leaves, so a run is open at question 3. */
async function openRunAtQuestion3(page: Page) {
  await startQuickPlay(page);
  for (let n = 1; n <= 2; n += 1) {
    await expect(round(page).getByText(`Question ${n} of 10`)).toBeVisible();
    await answerByKey(page, "a");
  }
  await expect(round(page).getByText("Question 3 of 10")).toBeVisible();
  await leave(page).click();
  await expect(page).toHaveURL("/");
}

/** No sideways scroll: nothing wider than the screen (WCAG 1.4.10, DESIGN §11 Reflow). */
async function expectNoSidewaysScroll(
  page: Page,
  width: number,
  where: string,
) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    where,
  ).toBeLessThanOrEqual(width);
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
      if (onBridges) {
        // R1-34 with a one-character answer, every time rather than by luck.
        await expect(sheet(page).getByRole("heading")).toHaveAccessibleName(
          "Right. It's 4.",
        );
      }
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
          await sheetRisen(page);
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
          // The sheet's body scrolls before the header takes the correct
          // option or the pick (DESIGN §6.10, D12).
          await expectMarkedOptionsOnScreen(page, `question ${n}`);
          await expectContinueOnScreen(page);
          await continueButton(page).click();
        }
      });
    });
  }

  test.describe("on a Pixel 7 at 200% text", () => {
    // The mobile-chromium project's phone, whichever project runs this.
    const pixel7 = devices["Pixel 7"];
    test.use({
      viewport: pixel7.viewport,
      userAgent: pixel7.userAgent,
      deviceScaleFactor: pixel7.deviceScaleFactor,
      isMobile: pixel7.isMobile,
      hasTouch: pixel7.hasTouch,
    });

    test("R1-21 Continue is on the screen after every reveal, even where the page is wider than the phone @cdp", async ({
      page,
    }) => {
      await textAt200(page);
      await startQuickPlay(page);
      for (let n = 1; n <= 3; n += 1) {
        await expect(
          round(page).getByText(`Question ${n} of 10`),
        ).toBeVisible();
        await page.keyboard.press(n % 2 === 0 ? "a" : "b");
        await expect(sheet(page)).toBeVisible();
        // DS-1's sheet rises into place from below its own height: measure
        // where it settles, as the player sees it.
        await sheet(page).evaluate((element) =>
          Promise.all(
            element.getAnimations({ subtree: true }).map((a) => a.finished),
          ),
        );
        // Against what is on the glass: a page wider than the phone makes
        // the layout viewport taller than the screen.
        const fit = await continueButton(page).evaluate((button) => {
          const box = button.getBoundingClientRect();
          const screen = window.visualViewport;
          const top = screen?.offsetTop ?? 0;
          return {
            top: box.top,
            bottom: box.bottom,
            from: top,
            to: top + (screen?.height ?? innerHeight),
          };
        });
        expect(fit.top, `question ${n}`).toBeGreaterThanOrEqual(fit.from - 0.5);
        expect(fit.bottom, `question ${n}`).toBeLessThanOrEqual(fit.to + 0.5);
        await expectRingRoom(page);
        await page.keyboard.press("Enter");
      }
    });

    test("D12 a sheet body that scrolls takes keyboard focus with the app's 3 px ring @cdp", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await textAt200(page);
      await startQuickPlay(page);
      const body = sheet(page).locator("[data-sheet-body]");
      // 200% text on a phone: a sheet whose body must give up height to keep
      // the correct option or the pick in view scrolls inside itself. With
      // DS-1's type that is most questions, not every one (a sheet that fits
      // once the options are out of reach scrolls the page instead, DESIGN
      // §6.10), and a run's questions are random: play on to the first.
      let scrolls = false;
      for (let n = 1; n <= 10 && !scrolls; n += 1) {
        await expect(
          round(page).getByText(`Question ${n} of 10`),
        ).toBeVisible();
        await page.keyboard.press("a");
        await expect(sheet(page)).toBeVisible();
        // The round fits the sheet in the commit that opens it.
        scrolls = (await body.getAttribute("tabindex")) === "0";
        if (!scrolls) await page.keyboard.press("Enter");
      }
      expect(scrolls).toBe(true);
      await expect(body).toHaveAttribute("tabindex", "0");
      // From the focused title, the first Tab reaches the body.
      await page.keyboard.press("Tab");
      await expect(body).toBeFocused();
      const ring = await body.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          style: style.outlineStyle,
          width: style.outlineWidth,
          offset: style.outlineOffset,
        };
      });
      // Inside its edge, so nothing around the box can cut it off.
      expect(ring).toEqual({ style: "solid", width: "3px", offset: "-3px" });
    });
  });

  test("R1-34 played by keyboard, each new question's stem and the results' score show the app's one 3 px ring", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await startQuickPlay(page);
    /** The focused element's ring, as `getComputedStyle` reports it. */
    const ring = (target: Locator) =>
      target.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.outlineWidth} ${style.outlineStyle} ${style.outlineOffset}`;
      });
    for (let n = 1; n <= 10; n += 1) {
      await expect(round(page).getByText(`Question ${n} of 10`)).toBeVisible();
      await expect(stem(page)).toBeFocused();
      // From question 2 the focus move follows a key press, so it is
      // :focus-visible, and the heading keeps the global ring (DESIGN §11).
      if (n > 1)
        expect(await ring(stem(page)), `question ${n}`).toBe("3px solid 3px");
      await answerByKey(page, "a");
    }
    await expect(page).toHaveURL("/practice/results");
    const score = page.locator("[data-practice-score]");
    await expect(score).toBeFocused();
    expect(await ring(score)).toBe("3px solid 3px");
  });

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
      // One character is an answer too: "It's 4." for the bridges question.
      await expect(heading).toHaveAccessibleName(
        /^(Right|Not quite)\. It's \S(?:.*\S)?\.$/,
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

  test.describe("from the Daily's stop screen", () => {
    test.use({ timezoneId: "Europe/London" });

    test("R1-36 Want more? Try a practice round. opens /practice, which offers the open run instead of resuming it", async ({
      page,
    }) => {
      // Sunday 1 November 2026: Daily #42, already finished today.
      await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
      await mockInit(page, { scenario: "finished_today" });
      await openRunAtQuestion3(page);

      await page.goto("/daily/42/results");
      await page
        .getByRole("link", { name: "Want more? Try a practice round." })
        .click();
      await expect(page).toHaveURL("/practice");
      await expect(
        page
          .getByRole("main")
          .getByRole("link", { name: "Continue practice · 3 of 10" }),
      ).toBeVisible();
      await expect(round(page)).toHaveCount(0);
    });
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

  test.describe("at 360 by 640 and 200% text", () => {
    test.use({ viewport: { width: 360, height: 640 } });

    test("R1-36 Continue practice · 3 of 10 wraps, so Today and /practice never scroll sideways @cdp", async ({
      page,
    }) => {
      await textAt200(page);
      await openRunAtQuestion3(page);
      await expect(
        todayCard(page).getByRole("link", {
          name: "Continue practice · 3 of 10",
        }),
      ).toBeVisible();
      await expectNoSidewaysScroll(page, 360, "Today");
      await page.goto("/practice");
      await expect(
        page
          .getByRole("main")
          .getByRole("link", { name: "Continue practice · 3 of 10" }),
      ).toBeVisible();
      await expectNoSidewaysScroll(page, 360, "/practice");
    });

    test("R1-17 a results row keeps the screen's width for its words, with only the icon beside them @cdp", async ({
      page,
    }) => {
      await textAt200(page);
      await startQuickPlay(page);
      for (let n = 1; n <= 10; n += 1) {
        await expect(
          round(page).getByText(`Question ${n} of 10`),
        ).toBeVisible();
        await answerByKey(page, n % 2 === 0 ? "a" : "b");
      }
      await expect(page).toHaveURL("/practice/results");
      const summaries = page.locator("[data-result-row] summary");
      await expect(summaries).toHaveCount(10);
      const widths = await summaries.evaluateAll((rows) =>
        rows.map((row) => ({
          row: row.getBoundingClientRect().width,
          words:
            row
              .querySelector("[data-result-stem]")
              ?.parentElement?.getBoundingClientRect().width ?? 0,
        })),
      );
      for (const [i, { row, words }] of widths.entries()) {
        // The 16 px icon and its gap take the rest; no hint beside them.
        expect(words, `row ${i + 1}`).toBeGreaterThanOrEqual(row * 0.8);
      }
      await expectNoSidewaysScroll(page, 360, "results");
    });
  });

  test.describe("at 1280 by 800", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("R1-13 D6 each option shows one key hint, the letter on its badge, and still names its keys", async ({
      page,
    }) => {
      await startQuickPlay(page);
      for (let n = 1; n <= 3; n += 1) {
        await expect(
          round(page).getByText(`Question ${n} of 10`),
        ).toBeVisible();
        const hints = await options(page).evaluateAll((buttons) =>
          buttons.map((button) => ({
            keys: button.getAttribute("aria-keyshortcuts") ?? "",
            kbd: [...button.querySelectorAll("kbd")].some((kbd) =>
              kbd.checkVisibility(),
            ),
            text: (button as HTMLElement).innerText,
          })),
        );
        for (const [i, hint] of hints.entries()) {
          expect(hint.keys, `option ${i + 1}`).toMatch(/^[A-D]( [1-4])?$/);
          expect(hint.kbd, `option ${i + 1}`).toBe(false);
          // "A 1" is for assistive technology; the eye sees the badge's A.
          if (hint.keys.includes(" ")) {
            expect(hint.text, `option ${i + 1}`).not.toContain(hint.keys);
          }
        }
        await answerAndContinue(page, n % 2);
      }
    });
  });

  test.describe("Share on the results (R1-01, PRD §3.5.4)", () => {
    // Each browser's own way to a clipboard a spec can read (Firefox and
    // WebKit refuse Chromium's permission names).
    test.beforeEach(async ({ page, browserName }) => {
      await allowClipboard(page, browserName);
    });

    // The results hand the practice text to the share feature's button
    // (src/features/share/share-button.tsx, built by FIX-DLY).
    test("R1-01 AC-SHR-05 AC-SHR-08 Share copies the run's line and a path-only /practice link, never a challenge", async ({
      page,
    }) => {
      // No Web Share, as in desktop Chromium on Linux.
      await page.addInitScript(() => {
        const proto = Navigator.prototype as unknown as Record<string, unknown>;
        delete proto.share;
        delete proto.canShare;
      });
      await startQuickPlay(page);
      await playToResults(page);
      const heading = await page
        .getByRole("heading", { level: 1 })
        .textContent();
      const score = /(\d+)\s*out of 10/.exec(heading ?? "")?.[1];
      await page.getByRole("button", { name: "Share", exact: true }).click();
      await expect(page.locator("#qz-live-polite")).toHaveText(
        "Copied. Paste it into your group chat.",
      );
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(text).toMatch(
        new RegExp(
          `^\\S+ Practice · Mixed · ${score ?? "\\d+"}/10\\nhttps?://[^/?#]+/practice$`,
        ),
      );
      expect(text).not.toContain("/c/");
      expect(
        await page.evaluate(() =>
          (
            (
              window as unknown as {
                __qzTrackLog?: { name: string; props: unknown }[];
              }
            ).__qzTrackLog ?? []
          )
            .filter((event) => event.name === "share_complete")
            .map((event) => event.props),
        ),
      ).toEqual([
        { method: "clipboard", mode: "practice", surface: "practice" },
      ]);
    });
  });
});

/** D12: the explanation whole on screen (not clamped, nothing behind Read more), with Learn more and Continue. */
async function expectWholeExplanation(page: Page) {
  await sheetRisen(page);
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
  await expectRingRoom(page);
  await expectContinueOnScreen(page);
}

/**
 * Learn more's focus ring (3 px at a 3 px offset) fits across the sheet's
 * body, which clips whatever pokes out of it once it scrolls.
 */
async function expectRingRoom(page: Page) {
  const room = await sheet(page)
    .getByRole("link", { name: /^Learn more about / })
    .evaluate((link) => {
      const body = link.closest("[data-sheet-body]");
      const box = link.getBoundingClientRect();
      const clip = body?.getBoundingClientRect();
      return {
        left: box.left - 6 - (clip?.left ?? -Infinity),
        right: (clip?.right ?? Infinity) - (box.right + 6),
      };
    });
  expect(room.left).toBeGreaterThanOrEqual(-0.5);
  expect(room.right).toBeGreaterThanOrEqual(-0.5);
}
