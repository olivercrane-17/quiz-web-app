/**
 * RITE round 3, practice (FIX3-PRA): each finding's reproduction, titled by
 * its id (docs/playtests/rite-3.md, sections 6, 7 and 9; decision D28 in
 * docs/02-PRODUCT-DECISIONS.md §26, and §25's legend line). Mock build,
 * fixture packs. R3-12's "no format twice in a row" is the planner's rule,
 * reproduced over 1,000 seeded runs in src/engine/practice/plan.test.ts.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

const round = (page: Page) => page.locator('[data-round="choice"]');
const stem = (page: Page) => round(page).getByRole("heading", { level: 1 });
const options = (page: Page) =>
  round(page).locator("[data-question] ol").getByRole("button");
/** The options group, where each question puts focus (D30). */
const group = (page: Page) => round(page).locator("[data-options]");
const sheet = (page: Page) => round(page).getByRole("region");
const feedbackHeading = (page: Page) =>
  sheet(page).getByRole("heading", { level: 2 });
const legend = (page: Page) => round(page).locator("[data-keys-legend]");
const continueButton = (page: Page) =>
  sheet(page).getByRole("button", {
    name: /^(Next question|See your results)$/,
  });

async function startQuickPlay(page: Page) {
  await page.goto("/");
  await page
    .locator('[data-home-slot="practice"]')
    .getByRole("link", { name: "Quick play" })
    .click();
  await expect(page).toHaveURL("/practice/run");
  await expect(group(page)).toBeFocused();
}

/** D28's words for the options on screen, naming only their letters (§25). */
async function expectedLegend(page: Page): Promise<string> {
  const count = await options(page).count();
  return count <= 2
    ? "Keys A and B answer at once."
    : `Keys A to ${count === 3 ? "C" : "D"} answer at once.`;
}

/**
 * The fixture true/false items and the option that misses each, so a run
 * that meets one can miss it on purpose (content/fixtures/practice).
 */
const TF_MISS: readonly [string, "True" | "False"][] = [
  ["island of Tarrow", "False"],
  ["river soup of Gorlund", "True"],
  ["Old Wall of Gorlund was built to keep out wolves", "True"],
  ["sky watchers could predict eclipses", "False"],
];

interface Missed {
  stem: string;
  chose: string;
  answer: string;
}

test.describe("RITE round 3: practice", () => {
  test("R3-07 with focus on option A, b answers B and focus leaves A, then rests on the feedback heading, where Enter moves on", async ({
    page,
  }) => {
    await startQuickPlay(page);
    // Dee's repro: Tab to option A, then the letter for B.
    await page.keyboard.press("Tab");
    await expect(options(page).first()).toBeFocused();
    await page.keyboard.press("b");
    // The ring never stays on the old option: it moves to the answer at
    // once, inside the beat, before the sheet opens.
    await expect(options(page).nth(1)).toBeFocused({ timeout: 800 });
    await expect(options(page).first()).not.toBeFocused();
    await expect(options(page).nth(1)).toHaveAttribute(
      "data-state",
      /^(locked|correct|your-answer)$/,
    );
    await expect(feedbackHeading(page)).toBeFocused();
    // The legend's words go once the answer is in.
    await expect(legend(page)).toHaveCount(0);
    // So the next Enter lands on the heading, which moves on, and on no
    // other control.
    await page.keyboard.press("Enter");
    await expect(round(page).getByText("Question 2 of 10")).toBeVisible();
    await expect(group(page)).toBeFocused();
  });

  test("D30 each question focuses its options group, labelled by the question, with the legend shown from the start, and b answers B with no Tab", async ({
    page,
  }) => {
    await startQuickPlay(page);
    for (let n = 1; n <= 3; n += 1) {
      await expect(round(page).getByText(`Question ${n} of 10`)).toBeVisible();
      // Focus is on the group, which reads the question first, then the keys.
      await expect(group(page)).toBeFocused();
      const question = (await stem(page).textContent()) ?? "";
      await expect(group(page)).toHaveAccessibleName(question);
      await expect(legend(page)).toBeVisible();
      await expect(legend(page)).toHaveText(await expectedLegend(page));
      await expect(group(page)).toHaveAccessibleDescription(
        await expectedLegend(page),
      );
      await expect(legend(page)).toBeInViewport({ ratio: 1 });
      const before = await options(page).first().boundingBox();
      // No Tab: the letter answers from where the question put focus.
      await page.keyboard.press("b");
      await expect(options(page).nth(1)).toBeFocused({ timeout: 800 });
      await expect(options(page).nth(1)).toHaveAttribute(
        "data-state",
        /^(locked|correct|your-answer)$/,
      );
      // Nothing shifted under the key (from 768 px the options stay put).
      const after = await options(page).first().boundingBox();
      if ((page.viewportSize()?.width ?? 0) >= 768) {
        expect(after?.y).toBe(before?.y);
      }
      await expect(feedbackHeading(page)).toBeFocused();
      await expect(legend(page)).toHaveCount(0);
      await page.keyboard.press("Enter");
    }
    await expect(round(page).getByText("Question 4 of 10")).toBeVisible();
  });

  test("D30 a key on anything outside the options group still answers nothing (WCAG 2.1.4), and focus the player moved stays put", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await expect(group(page)).toBeFocused();
    // The player moves focus to Leave: letters there do nothing.
    await page.keyboard.press("Shift+Tab");
    const leave = page.getByRole("link", { name: "Leave practice" });
    await expect(leave).toBeFocused();
    for (const key of ["a", "b", "1", "d"]) await page.keyboard.press(key);
    // Nor on the page itself.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    for (const key of ["a", "b", "1", "d"]) await page.keyboard.press(key);
    await page.waitForTimeout(600);
    const count = await options(page).count();
    for (let i = 0; i < count; i += 1) {
      await expect(options(page).nth(i)).toHaveAttribute("data-state", "idle");
    }
    await expect(sheet(page)).toHaveCount(0);
    await expect(group(page)).not.toBeFocused();
  });

  test.describe("D30 on a 390 x 844 phone at 200% text", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("D30 the legend is on screen from the start, above option A, and a letter from the group moves nothing before it answers", async ({
      page,
    }) => {
      await startQuickPlay(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await expect(group(page)).toBeFocused();
      await expect(legend(page)).toBeVisible();
      const list = round(page).locator("[data-question] ol");
      const line = await legend(page).boundingBox();
      const first = await list.boundingBox();
      expect(line).not.toBeNull();
      expect(first).not.toBeNull();
      if (line === null || first === null) return;
      expect(line.y + line.height).toBeLessThanOrEqual(first.y);
      const scrolled = await page.evaluate(() => window.scrollY);
      // The key goes down on the group: pressed, not yet answered, and
      // neither the options' list nor the page moved.
      await page.keyboard.down("a");
      await expect(options(page).first()).toHaveAttribute("data-pressed", "");
      expect((await list.boundingBox())?.y).toBe(first.y);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
      await page.keyboard.up("a");
      await expect(options(page).first()).toHaveAttribute(
        "data-state",
        /^(locked|correct|your-answer)$/,
      );
    });
  });

  test("R3-07 the legend reads Keys A to D answer at once. above the options (D28)", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await page.keyboard.press("Tab");
    await expect(legend(page)).toBeVisible();
    await expect(legend(page)).toHaveText(await expectedLegend(page));
    const line = await legend(page).boundingBox();
    const first = await options(page).first().boundingBox();
    expect(line).not.toBeNull();
    expect(first).not.toBeNull();
    if (line === null || first === null) return;
    expect(line.y + line.height).toBeLessThanOrEqual(first.y);
  });

  test("R3-07 from 768 px, neither the legend nor the lock-in moves the options", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await startQuickPlay(page);
    const top = async () => {
      const box = await options(page).first().boundingBox();
      const scrolled = await page.evaluate(() => window.scrollY);
      return (box?.y ?? Number.NaN) + scrolled;
    };
    const before = await top();
    await page.keyboard.press("Tab");
    await expect(legend(page)).toBeVisible();
    expect(await top()).toBeCloseTo(before, 0);
    await page.keyboard.press("a");
    await expect(options(page).first()).toHaveAttribute(
      "data-state",
      /^(locked|correct|your-answer)$/,
    );
    await expect(legend(page)).toHaveCount(0);
    expect(await top()).toBeCloseTo(before, 0);
  });

  // 360 x 640 is the narrowest phone (R1-21): there the legend wraps to
  // two lines and the Tab scrolls the page.
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    test.describe(`on a ${viewport.width} x ${viewport.height} phone at 200% text`, () => {
      test.use({ viewport });

      test("R3-07 the legend's box is inside the viewport and above option A, and showing it moves nothing", async ({
        page,
      }) => {
        await startQuickPlay(page);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await expect(stem(page)).toBeVisible();
        const before = await options(page).first().boundingBox();
        const scrolledBefore = await page.evaluate(() => window.scrollY);
        await page.keyboard.press("Tab");
        await expect(options(page).first()).toBeFocused();
        await expect(legend(page)).toBeVisible();
        await expect(legend(page)).toBeInViewport({ ratio: 1 });
        const line = await legend(page).boundingBox();
        const first = await options(page).first().boundingBox();
        expect(before).not.toBeNull();
        expect(line).not.toBeNull();
        expect(first).not.toBeNull();
        if (line === null || first === null || before === null) return;
        expect(line.y).toBeGreaterThanOrEqual(0);
        expect(line.y + line.height).toBeLessThanOrEqual(viewport.height);
        expect(line.y + line.height).toBeLessThanOrEqual(first.y);
        // The line was held: option A is where it was before the legend
        // showed, after any scroll the Tab caused is taken back out.
        const scrolled = await page.evaluate(() => window.scrollY);
        expect(first.y + scrolled).toBeCloseTo(before.y + scrolledBefore, 0);
        // No sideways scroll.
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      });
    });
  }

  test("R3-11 a true-or-false miss reads You chose True. in the results, as the option reads", async ({
    page,
  }) => {
    test.slow();
    await startQuickPlay(page);
    // Quick play holds at most one true/false, and not always one: play
    // runs until one is missed.
    const found: { missed: Missed | null } = { missed: null };
    for (let run = 0; run < 6 && found.missed === null; run += 1) {
      for (let n = 1; n <= 10; n += 1) {
        await expect(
          round(page).getByText(`Question ${n} of 10`),
        ).toBeVisible();
        const text = (await stem(page).textContent()) ?? "";
        const labels = await options(page).evaluateAll((buttons) =>
          buttons.map(
            (button) =>
              button.textContent?.replace(/^[A-D]\.\s*/, "").trim() ?? "",
          ),
        );
        let pick = 0;
        const trueFalse =
          labels.length === 2 &&
          labels.some((label) => label.includes("True")) &&
          labels.some((label) => label.includes("False"));
        const tf = trueFalse
          ? TF_MISS.find(([part]) => text.includes(part))
          : undefined;
        if (tf !== undefined) {
          pick = labels.findIndex((label) => label.includes(tf[1]));
          expect(pick).toBeGreaterThanOrEqual(0);
          found.missed = {
            stem: text,
            chose: tf[1],
            answer: tf[1] === "True" ? "False" : "True",
          };
        }
        await options(page).nth(pick).click();
        await expect(options(page).nth(pick)).toHaveAttribute(
          "data-state",
          /^(correct|your-answer)$/,
        );
        await stem(page).click();
        await continueButton(page).click();
      }
      await expect(page).toHaveURL("/practice/results");
      if (found.missed === null) {
        await page.getByRole("button", { name: "Play again" }).click();
        await expect(page).toHaveURL("/practice/run");
      }
    }
    const { missed } = found;
    expect(missed).not.toBeNull();
    if (missed === null) return;
    const row = page
      .locator('[data-result-row="wrong"]')
      .filter({ hasText: missed.stem });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(
      `Not quite. Answer: ${missed.answer}. You chose ${missed.chose}.`,
    );
    await expect(row).not.toContainText(
      `You chose ${missed.chose.toLowerCase()}.`,
    );
  });
});
