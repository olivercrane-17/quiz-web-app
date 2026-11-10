/**
 * RITE round 5, practice (FIX5): R5-01's reproduction, titled by its id
 * (docs/playtests/rite-5.md, sections 5, 6 and 7; decision D36 in
 * docs/02-PRODUCT-DECISIONS.md §28). Priya, Marcus, Lena and Dee finished
 * the Daily, whose last clue taught "Tap one, then Lock in.", opened Quick
 * play, and had question 1 scored on a tap they meant as a choice: on a
 * touch phone the line above the options was an empty strip, inside a
 * heavy focus frame. The line now always says how answering works, and a
 * touch load draws no frame. Practice stays one tap per answer. Mock
 * build, fixture packs, Daily #51.
 */
import type { Locator, Page } from "@playwright/test";

import { lockInButton, optionButtons } from "../daily/clue-4";
import { expect, test } from "../fixtures";

/** 09:00 in London on Tuesday 10 November 2026: Daily #51, round 5's own. */
const NOV_10 = new Date("2026-11-10T09:00:00Z");

const TAP_LINE = "Tap an answer. It counts straight away.";
const KEYS_LINE = /^A tap or a key A (to [CD]|or B) answers at once\.$/;

/** The personas' phone: touch only. */
const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
} as const;
/** The small phone of release criterion R2. */
const SMALL_PHONE = {
  viewport: { width: 360, height: 640 },
  hasTouch: true,
  isMobile: true,
} as const;

const round = (page: Page) => page.locator('[data-round="choice"]');
const options = (page: Page) =>
  round(page).locator("[data-question] ol").getByRole("button");
const group = (page: Page) => round(page).locator("[data-options]");
/** The line above the options, and the key legend while it is one. */
const line = (page: Page) => round(page).locator("[data-keys-line]");
const legend = (page: Page) => round(page).locator("[data-keys-legend]");
const sheet = (page: Page) => round(page).getByRole("region");
const mystery = (page: Page) => page.locator('[data-round="mystery"]');

const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  expect(found).not.toBeNull();
  return found ?? { x: 0, y: 0, width: 0, height: 0 };
};

/** How the options group's focus frame is painted. */
const frameOf = (page: Page) =>
  group(page).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focused: document.activeElement === element,
      ring: element.hasAttribute("data-focus-ring"),
      outline:
        style.outlineStyle === "none" ? 0 : parseFloat(style.outlineWidth),
    };
  });

/**
 * Daily #51 to its stop screen by touch alone, as the personas played it:
 * Next clue three times on every Mystery, a tap to choose, the Lock in bar
 * to send, then the Encore from its button. No key is pressed.
 */
async function playDailyByTouch(page: Page) {
  await page.goto("/daily");
  for (const next of ["Next mystery", "Next mystery", "On to the Encore"]) {
    for (let shown = 1; shown < 4; shown += 1) {
      await page.getByRole("button", { name: /^(Next|Last) clue/ }).tap();
      await expect(mystery(page)).toHaveAttribute(
        "data-clue",
        String(shown + 1),
      );
    }
    // What the Daily teaches, on cards like practice's.
    await expect(page.locator("[data-keys-legend]")).toHaveText(
      "Tap one, then Lock in.",
    );
    await optionButtons(page).first().tap();
    await expect(page.locator("[data-reveal]")).toHaveCount(0);
    await lockInButton(page).tap();
    await page.getByRole("button", { name: next }).tap();
  }
  const field = page.getByRole("textbox", { name: "Your number" });
  await field.fill("300");
  await page.locator('[data-round="encore"] [data-lock-in]').tap();
  await page.getByRole("button", { name: "See your results" }).tap();
  await expect(
    page
      .getByRole("button", { name: "Done for today" })
      .or(page.getByRole("link", { name: "Done for today" })),
  ).toBeVisible();
}

/** Quick play from Today, by touch. */
async function openQuickPlayByTouch(page: Page) {
  await page.goto("/");
  await page
    .locator('[data-home-slot="practice"]')
    .getByRole("link", { name: "Quick play" })
    .tap();
  await expect(page).toHaveURL("/practice/run");
  await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
}

test.use({ timezoneId: "Europe/London" });

test.describe("R5-01 practice says how answering works (D36)", () => {
  test.beforeEach(({ browserName }) => {
    // Chromium's touch emulation reports a coarse pointer that can't
    // hover, as a phone does. Elsewhere the engine keeps the desktop's
    // mouse, and the component tests hold the rule.
    test.skip(
      browserName !== "chromium",
      "touch emulation changes the pointer media only in Chromium",
    );
  });

  test.describe("on a touch-only phone, 390 x 844", () => {
    test.use(PHONE);

    test("R5-01 the personas' path: after Daily #51 by touch, Quick play's question 1 says Tap an answer. It counts straight away. above option A, with no focus frame, and one tap answers", async ({
      page,
    }) => {
      test.slow();
      await page.clock.setFixedTime(NOV_10);
      await playDailyByTouch(page);
      await openQuickPlayByTouch(page);
      expect(
        await page.evaluate(
          () => matchMedia("(hover: hover) and (pointer: fine)").matches,
        ),
      ).toBe(false);

      // Before any tap on question 1.
      await expect(line(page)).toBeVisible();
      await expect(line(page)).toHaveText(TAP_LINE);
      await expect(line(page)).toHaveCSS("visibility", "visible");
      await expect(line(page)).toBeInViewport({ ratio: 1 });
      await expect(legend(page)).toHaveCount(0);
      await expect(page.getByText(/key A/i)).toBeHidden();
      const [said, first] = [
        await box(line(page)),
        await box(options(page).first()),
      ];
      expect(said.y + said.height).toBeLessThanOrEqual(first.y);
      // The group holds focus for a screen reader, and draws no frame.
      await expect(group(page)).not.toHaveAttribute("data-focus-ring");
      expect(await frameOf(page)).toEqual({
        focused: true,
        ring: false,
        outline: 0,
      });
      await expect(group(page)).toHaveAccessibleDescription(TAP_LINE);

      // Behaviour unchanged: one tap answers, and the verdict shows.
      await options(page).first().tap();
      await expect(options(page).first()).toHaveAttribute(
        "data-state",
        /^(locked|correct|your-answer)$/,
      );
      await expect(
        sheet(page).getByRole("button", { name: "Next question" }),
      ).toBeVisible();
      await expect(sheet(page).locator("[data-verdict]")).toBeVisible();
    });

    test("R5-01 a fresh profile with no Daily played reads the same line on question 1, and on the questions after it", async ({
      page,
    }) => {
      await openQuickPlayByTouch(page);
      for (let n = 1; n <= 3; n += 1) {
        await expect(
          round(page).getByText(`Question ${String(n)} of 10`),
        ).toBeVisible();
        await expect(line(page)).toBeVisible();
        await expect(line(page)).toHaveText(TAP_LINE);
        expect((await frameOf(page)).outline).toBe(0);
        await options(page).first().tap();
        await sheet(page).getByRole("button", { name: "Next question" }).tap();
      }
    });

    test("R5-01 a phone that loads straight into a question, with no input at all, draws no frame around its options", async ({
      page,
    }) => {
      // Lena's clean touch session: the page's first focus move comes
      // before any input, which Chromium frames for a keyboard's sake.
      await openQuickPlayByTouch(page);
      await page.reload();
      await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
      await expect(group(page)).toBeFocused();
      await expect(group(page)).toHaveAttribute("data-focus-quiet", "");
      expect(await frameOf(page)).toEqual({
        focused: true,
        ring: false,
        outline: 0,
      });
      await expect(line(page)).toHaveText(TAP_LINE);
      // A keyboard that joins in gets its frame back with its first key.
      await page.keyboard.press("Shift");
      await expect(group(page)).not.toHaveAttribute("data-focus-quiet");
      expect((await frameOf(page)).outline).toBeGreaterThanOrEqual(3);
    });

    test("R5-01 once the answer is in, the line goes with the question and leaves no band", async ({
      page,
    }) => {
      await openQuickPlayByTouch(page);
      await options(page).first().tap();
      await expect(
        sheet(page).getByRole("button", { name: "Next question" }),
      ).toBeVisible();
      await expect(line(page)).toBeHidden();
    });
  });

  for (const [name, device, percent] of [
    ["390 x 844", PHONE, 100],
    ["360 x 640 at 200% text", SMALL_PHONE, 200],
  ] as const) {
    test.describe(`nothing shifts, at ${name}`, () => {
      test.use(device);

      test(`R5-01 R5-12 at ${name} a first key changes the words in place, a touch changes them back, and option A never moves`, async ({
        page,
      }) => {
        await page.addInitScript((size) => {
          const add = () => {
            const style = document.createElement("style");
            style.textContent = `html { font-size: ${String(size)}% !important; }`;
            document.head.append(style);
          };
          if (document.head === null) {
            document.addEventListener("DOMContentLoaded", add);
          } else add();
        }, percent);
        await openQuickPlayByTouch(page);
        await expect(line(page)).toHaveText(TAP_LINE);
        const place = async () => ({
          line: await box(line(page)),
          first: await box(options(page).first()),
          last: await box(options(page).last()),
          scroll: await page.evaluate(() => window.scrollY),
        });
        const before = await place();

        // A hardware key that answers nothing: the keys' wording arrives.
        await page.keyboard.press("Shift");
        await expect(legend(page)).toBeVisible();
        await expect(line(page)).toHaveText(KEYS_LINE);
        await expect(group(page)).toHaveAccessibleDescription(KEYS_LINE);
        expect(await place()).toEqual(before);

        // R5-12: a touch after the key goes back to the touch wording.
        await round(page).getByRole("heading", { level: 1 }).tap();
        await expect(line(page)).toHaveText(TAP_LINE);
        await expect(legend(page)).toHaveCount(0);
        expect(await place()).toEqual(before);
      });
    });
  }

  test.describe("with a mouse or a trackpad", () => {
    test.use({
      viewport: { width: 1280, height: 800 },
      hasTouch: false,
      isMobile: false,
    });

    test("R5-01 the line names a tap and the keys from the start: A tap or a key A to D answers at once.", async ({
      page,
    }) => {
      await page.goto("/");
      await page
        .locator('[data-home-slot="practice"]')
        .getByRole("link", { name: "Quick play" })
        .click();
      await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
      await expect(line(page)).toBeVisible();
      await expect(line(page)).toHaveText(KEYS_LINE);
      await expect(group(page)).toHaveAccessibleDescription(KEYS_LINE);
      await expect(group(page)).not.toHaveAttribute("data-focus-quiet");
      // One key still answers, as the line says.
      await page.keyboard.press("a");
      await expect(options(page).first()).toHaveAttribute(
        "data-state",
        /^(locked|correct|your-answer)$/,
      );
    });
  });
});
