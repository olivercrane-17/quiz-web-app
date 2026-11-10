/**
 * RITE round 5's Daily fixes (FIX5; docs/playtests/rite-5.md §6 and §7,
 * decisions memo §28), in a real browser on the production build and the
 * mock backend. Each test title starts with the finding it reproduces:
 * the Encore's Enter and its named button (R5-02, D37), clue 4's legend
 * (R5-03) and its typed-word rule after a pause (R5-04, D38), and the help
 * pages' reporting sentences (R5-06).
 *
 * Daily #51 (Tuesday 10 November 2026) is round 5's own: The Lantern
 * Keeper, Cobalt, Arvenna, then the Encore.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import type { RemoteMockControls } from "../support/mock";
import { lockInButton, optionButtons, pickFirstOption } from "./clue-4";

/** 09:00 in London on Tuesday 10 November 2026: Daily #51. */
const NOV_10 = new Date("2026-11-10T09:00:00Z");

const KEYS = "Keys A to D choose. Enter on your choice locks in.";
const TAP = "Tap one, then Lock in.";
const TYPED = "Typing chooses nothing. Press Esc, then A to D.";

/** A desk: a mouse that hovers, so a keyboard is likely (D32). */
const DESK = {
  viewport: { width: 1280, height: 800 },
  hasTouch: false,
  isMobile: false,
} as const;
/** Priya's phone: touch only. */
const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
} as const;
/** The small phone of release criterion R2: touch only. */
const SMALL_PHONE = {
  viewport: { width: 360, height: 640 },
  hasTouch: true,
  isMobile: true,
} as const;

test.use({ timezoneId: "Europe/London" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOV_10);
});

const round = (page: Page) => page.locator('[data-round="mystery"]');
const encore = (page: Page) => page.locator('[data-round="encore"]');
const reveal = (page: Page) => page.locator("[data-reveal]");
const legend = (page: Page) => page.locator("[data-keys-legend]");
const status = (page: Page) => page.locator("#qz-live-polite");
const optionsGroup = (page: Page) =>
  page.getByRole("group", { name: /^Clue 4:/ });

/** Opens today's Daily on Mystery 1's clue 1. */
async function openDaily(page: Page): Promise<void> {
  await page.goto("/daily");
  await expect(
    page.getByRole("combobox", { name: "Your guess" }),
  ).toBeVisible();
}

/** Waits until the round's entrance transitions end, so boxes are measured at rest. */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    (
      document
        .querySelector("[data-round]")
        ?.getAnimations({ subtree: true }) ?? []
    ).every((animation) => animation.playState !== "running"),
  );
}

/** Next clue three times, by pointer or touch: no key is pressed. */
async function toClue4(page: Page) {
  for (let shown = 1; shown < 4; shown += 1) {
    await page.getByRole("button", { name: /^(Next|Last) clue/ }).click();
    await expect(round(page)).toHaveAttribute("data-clue", String(shown + 1));
  }
  await settle(page);
}

/** The three Mysteries out on their first options, to the Encore's question. */
async function toEncore(page: Page) {
  await openDaily(page);
  for (const next of ["Next mystery", "Next mystery", "On to the Encore"]) {
    await toClue4(page);
    await pickFirstOption(page);
    await page.getByRole("button", { name: next }).click();
  }
  await expect(
    page.getByRole("textbox", { name: "Your number" }),
  ).toBeVisible();
}

/** The label an option shows, without its letter. */
async function labelOf(option: Locator): Promise<string> {
  const label = (await option.locator(".kn-answer-text").textContent()) ?? "";
  expect(label).not.toBe("");
  return label;
}

/** How many round actions (guesses, picks, Next clues, lock-ins) reached the mock. */
async function actsSent(mock: RemoteMockControls): Promise<number> {
  return (await mock.responses()).filter(
    (response) => response.method === "sealed.act",
  ).length;
}

const topOf = async (locator: Locator) => (await locator.boundingBox())?.y;

test.describe("the Encore's Enter on a touch phone (R5-02, D37)", () => {
  test.use(PHONE);

  test("R5-02 Priya's path: type 300 and press the keyboard's Enter; nothing is sent, the field lets go, and Lock in 300 m sends it", async ({
    page,
    mock,
  }) => {
    test.slow();
    await toEncore(page);
    const field = page.getByRole("textbox", { name: "Your number" });
    const lockIn = encore(page).locator("[data-lock-in]");
    const result = page.locator("[data-encore-result]");
    // A touch-only phone: nothing says Enter locks in, and the key is "done".
    await expect(encore(page).locator("[data-enter-hint]")).toHaveCount(0);
    await expect(field).toHaveAttribute("enterkeyhint", "done");
    await expect(lockIn).toHaveAccessibleName("Lock in");
    const before = await actsSent(mock);

    await field.tap();
    await expect(field).toBeFocused();
    // The on-screen keyboard's keys land in the field.
    await page.keyboard.type("300");
    await expect(encore(page).locator("[data-encore-line]")).toHaveText(
      /^You're answering 300 \S+$/,
    );
    const amount = (
      (await encore(page).locator("[data-encore-line] strong").textContent()) ??
      ""
    ).trim();
    expect(amount).toMatch(/^300 \S+$/);
    await expect(lockIn).toHaveAccessibleName(`Lock in ${amount}`);

    await page.keyboard.press("Enter");
    // Still the Daily's Encore, with no result: Enter only left the field.
    await expect(field).not.toBeFocused();
    await expect(page).toHaveURL("/daily");
    await expect(result).toHaveCount(0);
    await expect(field).toHaveValue("300");
    await expect(field).not.toHaveAttribute("readonly");
    await expect(encore(page).locator("[data-encore-line]")).toHaveText(
      /^You're answering 300 \S+$/,
    );
    await expect(encore(page).locator("[data-enter-hint]")).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);

    // The button that names the number sends it, once.
    await lockIn.tap();
    await expect(result).toBeVisible();
    await expect(result).toContainText(`Your guess ${amount}`);
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R5-02 the named button is one line where plain Lock in was: nothing under the field moves when the number arrives", async ({
    page,
  }) => {
    test.slow();
    await toEncore(page);
    const field = page.getByRole("textbox", { name: "Your number" });
    const lockIn = encore(page).locator("[data-lock-in]");
    const place = await lockIn.boundingBox();
    await field.fill("1250000");
    await expect(lockIn).toHaveAccessibleName(/^Lock in 1,250,000 \S+$/);
    expect(await lockIn.boundingBox()).toEqual(place);
    await expect(lockIn).toBeInViewport({ ratio: 1 });
  });
});

test.describe("the Encore's Enter with a keyboard (R5-02, D37)", () => {
  test.use(DESK);

  test("R5-02 where Enter locks in. shows, Enter in the field still sends the answer, once", async ({
    page,
    mock,
  }) => {
    test.slow();
    await toEncore(page);
    const field = page.getByRole("textbox", { name: "Your number" });
    await expect(encore(page).locator("[data-enter-hint]")).toHaveText(
      "Enter locks in.",
    );
    const before = await actsSent(mock);
    await field.fill("300");
    await expect(encore(page).locator("[data-lock-in]")).toHaveAccessibleName(
      /^Lock in 300 \S+$/,
    );
    await field.press("Enter");
    await expect(page.locator("[data-encore-result]")).toBeVisible();
    expect(await actsSent(mock)).toBe(before + 1);
  });
});

test.describe("clue 4's legend and its third key (R5-03, R5-04, D38)", () => {
  test.use(DESK);

  test("R5-03 Sam's path: the legend reads Keys A to D choose. Enter on your choice locks in.; a, Tab, Enter chooses B and sends nothing, and Enter again sends B", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    await expect(optionsGroup(page)).toBeFocused();
    await expect(legend(page)).toHaveText(KEYS);
    await expect(optionsGroup(page)).toHaveAccessibleDescription(
      new RegExp(`${KEYS.replaceAll(".", "\\.")}$`),
    );
    const [a, b] = [optionButtons(page).nth(0), optionButtons(page).nth(1)];
    const before = await actsSent(mock);
    await page.keyboard.press("a");
    await expect(a).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Tab");
    await expect(b).toBeFocused();
    await page.keyboard.press("Enter");
    // Enter acted on the option it was pressed on: B is the choice now.
    await expect(b).toHaveAttribute("aria-pressed", "true");
    await expect(a).not.toHaveAttribute("aria-pressed");
    await expect(reveal(page)).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);
    const bLabel = await labelOf(b);
    await page.keyboard.press("Enter");
    await expect(reveal(page)).toBeVisible();
    await expect(reveal(page)).toContainText(bLabel);
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R5-04 Dee's path: a, a pause, b, a pause, d, three slow changes of mind, ends with D chosen, and Enter locks D in", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    await expect(optionsGroup(page)).toBeFocused();
    const d = optionButtons(page).nth(3);
    const before = await actsSent(mock);
    await page.keyboard.press("a");
    await page.waitForTimeout(1_700);
    await page.keyboard.press("b");
    await page.waitForTimeout(1_700);
    await page.keyboard.press("d");
    await expect(d).toHaveAttribute("aria-pressed", "true");
    await expect(d).toBeFocused();
    await expect(legend(page)).toHaveText(KEYS);
    const dLabel = await labelOf(d);
    await expect(lockInButton(page)).toHaveAccessibleName(`Lock in ${dLabel}`);
    expect(await actsSent(mock)).toBe(before);
    await page.keyboard.press("Enter");
    await expect(reveal(page)).toBeVisible();
    await expect(reveal(page)).toContainText(dLabel);
    expect(await actsSent(mock)).toBe(before + 1);
  });

  for (const [word, delay] of [
    ["dad", 250],
    ["cab", 600],
    ["abba", 900],
  ] as const) {
    test(`R5-04 ${word} at ${String(delay)} ms a key, then Enter, locks nothing: no option is pressed, focus is back on the options group, and nothing moved`, async ({
      page,
      mock,
    }) => {
      await openDaily(page);
      await toClue4(page);
      await expect(optionsGroup(page)).toBeFocused();
      const before = await actsSent(mock);
      const line = await legend(page).locator("xpath=..").boundingBox();
      const firstTop = await topOf(optionButtons(page).first());
      await page.keyboard.type(word, { delay });
      await expect(legend(page)).toHaveText(TYPED);
      await expect(status(page)).toHaveText(TYPED);
      await expect(page.locator("[data-chosen]")).toHaveCount(0);
      await expect(
        page.locator('[data-options] [aria-pressed="true"]'),
      ).toHaveCount(0);
      // No option wears a ring that reads as a choice.
      await expect(optionsGroup(page)).toBeFocused();
      // The line held room for these words: nothing under it moved.
      expect(await legend(page).locator("xpath=..").boundingBox()).toEqual(
        line,
      );
      expect(await topOf(optionButtons(page).first())).toBe(firstTop);
      await page.keyboard.press("Enter");
      await expect(lockInButton(page)).toHaveAccessibleName("Lock in");
      await expect(reveal(page)).toHaveCount(0);
      await expect(round(page)).toHaveAttribute("data-clue", "4");
      expect(await actsSent(mock)).toBe(before);
    });
  }
});

test.describe("clue 4's line on a small phone (R5-03, R5-12)", () => {
  test.use(SMALL_PHONE);

  test("R5-03 at 360 by 640 the longer legend arrives in the room the line held: option A and the Lock in bar stay put, and a touch brings the tap line back", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "touch emulation changes the pointer media only in Chromium",
    );
    await openDaily(page);
    for (let shown = 1; shown < 4; shown += 1) {
      await page.getByRole("button", { name: /^(Next|Last) clue/ }).tap();
      await expect(round(page)).toHaveAttribute("data-clue", String(shown + 1));
    }
    await settle(page);
    await expect(legend(page)).toHaveText(TAP);
    const place = async () => ({
      line: await legend(page).locator("xpath=..").boundingBox(),
      first: await optionButtons(page).first().boundingBox(),
      bar: await lockInButton(page).boundingBox(),
    });
    const before = await place();
    await page.keyboard.press("Shift");
    await expect(legend(page)).toHaveText(KEYS);
    expect(await place()).toEqual(before);
    // The legend fits the screen's width.
    const shown = await legend(page).boundingBox();
    expect((shown?.x ?? 0) + (shown?.width ?? 0)).toBeLessThanOrEqual(360);
    // R5-12: a touch after the key reads the tap line again.
    await page.locator("[data-options-lead]").tap();
    await expect(legend(page)).toHaveText(TAP);
    expect(await place()).toEqual(before);
  });
});

/** The phone's text size at 200% (release criterion R2). */
const LARGE_TEXT = "html { font-size: 200% !important; }";

/** How the options group's focus frame is painted. */
const frameOf = (page: Page) =>
  optionsGroup(page).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focused: document.activeElement === element,
      quiet: element.hasAttribute("data-focus-quiet"),
      outline:
        style.outlineStyle === "none" ? 0 : parseFloat(style.outlineWidth),
    };
  });

for (const [name, device, large] of [
  ["360 by 640", SMALL_PHONE, false],
  ["360 by 640 with 200% text", SMALL_PHONE, true],
  ["390 by 844 with 200% text", PHONE, true],
] as const) {
  test.describe(`clue 4 on a touch-only phone, ${name} (R5-05, R5-11, D36)`, () => {
    test.use(device);

    test(`R5-11 at ${name}, arriving at clue 4 by touch draws no frame around the options, and the line is no taller than the typed-word wording; a first key brings the frame and the keys' legend`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName !== "chromium",
        "touch emulation changes the pointer media only in Chromium",
      );
      await openDaily(page);
      if (large) await page.addStyleTag({ content: LARGE_TEXT });
      for (let shown = 1; shown < 4; shown += 1) {
        await page.getByRole("button", { name: /^(Next|Last) clue/ }).tap();
        await expect(round(page)).toHaveAttribute(
          "data-clue",
          String(shown + 1),
        );
      }
      await settle(page);
      // No key yet: the group has focus, quietly.
      await expect(optionsGroup(page)).toBeFocused();
      await expect(optionsGroup(page)).toHaveAttribute("data-focus-quiet", "");
      expect(await frameOf(page)).toEqual({
        focused: true,
        quiet: true,
        outline: 0,
      });
      // R5-05: the line holds room for the typed-word wording and no more,
      // so a touch player reads no blank line the keys' legend would need.
      await expect(legend(page)).toHaveText(TAP);
      const heights = await legend(page).evaluate((shown, typed) => {
        const line = shown.parentElement;
        if (line === null) throw new Error("no line");
        const probe = document.createElement("p");
        probe.className = line.className;
        probe.textContent = typed;
        line.after(probe);
        const typedHeight = probe.getBoundingClientRect().height;
        probe.remove();
        return { line: line.getBoundingClientRect().height, typedHeight };
      }, TYPED);
      expect(heights.typedHeight).toBeGreaterThan(0);
      expect(heights.line).toBeLessThanOrEqual(heights.typedHeight);
      // A keyboard that joins in finds its frame and its legend.
      await page.keyboard.press("Shift");
      await expect(optionsGroup(page)).not.toHaveAttribute("data-focus-quiet");
      expect((await frameOf(page)).outline).toBeGreaterThanOrEqual(3);
      await expect(legend(page)).toHaveText(KEYS);
    });
  });
}

test.describe("the help pages promise no report control yet (R5-06)", () => {
  for (const path of ["/about-our-questions", "/content-policy"]) {
    test(`R5-06 ${path} doesn't name Report a problem, and gives the address to write to`, async ({
      page,
    }) => {
      await page.goto(path);
      const main = page.getByRole("main");
      await expect(main).toBeVisible();
      await expect(main).not.toContainText("Report a problem");
      await expect(
        main.getByRole("link", { name: "hello@knewt.app" }).first(),
      ).toBeVisible();
      await expect(main).toContainText(
        "and tell us which question it was and what's wrong",
      );
    });
  }

  test("R5-01 How to play says practice differs from clue 4: there the first choice counts", async ({
    page,
  }) => {
    await page.goto("/how-scoring-works");
    const clue4 = page
      .getByRole("main")
      .getByText("Choose one, then Lock in.", { exact: false });
    await expect(clue4).toBeVisible();
    // The next paragraph of the same part.
    await expect(clue4.locator("xpath=following-sibling::*[1]")).toHaveText(
      "Practice is quicker: there, your first choice counts straight away.",
    );
  });
});
