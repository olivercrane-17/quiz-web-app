/**
 * The Mystery's and the Encore's fixes after RITE round 2 (FIX2-MYS;
 * docs/playtests/rite-2.md §5, §6; the decisions memo §22), in a real
 * browser on the production build and the mock backend. Each test title
 * starts with the finding it reproduces.
 *
 * Daily #45 (Wednesday 4 November 2026) plays the fixture film, cobalt and
 * Arvenna, then Lake Ostry (86.4 m). Daily #46 (Thursday 5 November) opens
 * on a person, Odile Marsh, the Mystery of Dee's repro.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import type { RemoteMockControls } from "../support/mock";
import { lockInButton, optionButtons, pickFirstOption } from "./clue-4";

/** 09:00 in London on Wednesday 4 November 2026: Daily #45. */
const NOV_4 = new Date("2026-11-04T09:00:00Z");
/** The next day: Daily #46, whose Mystery 1 is a person. */
const NOV_5 = new Date("2026-11-05T09:00:00Z");

/** The phone's text size at 200% (PRD §3.12.4, release criterion R2). */
const LARGE_TEXT = "html { font-size: 200% !important; }";

const LEGEND = "Keys A to D choose. Enter on your choice locks in.";
const LAST_LEAD =
  "Last clue. Pick one of four. One pick: a wrong one scores 0.";

/**
 * Clue 4's options group: since D28 (RITE round 3) labelled by the clue and
 * described by its line, and where focus lands as the options arrive.
 */
function optionsGroup(page: Page): Locator {
  return page.getByRole("group", { name: /^Clue 4:/ });
}

test.use({ timezoneId: "Europe/London" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOV_4);
});

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

/** Where `locator` is drawn, in viewport coordinates. */
async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("not laid out");
  return {
    top: box.y,
    bottom: box.y + box.height,
    left: box.x,
    right: box.x + box.width,
    width: box.width,
  };
}

/** Opens today's Daily at `size`, on Mystery 1's clue 1. */
async function openDaily(
  page: Page,
  size: { width: number; height: number },
): Promise<Locator> {
  await page.setViewportSize(size);
  await page.goto("/daily");
  const field = page.getByRole("combobox", { name: "Your guess" });
  await expect(field).toBeVisible();
  return field;
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

/** Presses Next clue until the round shows `clue`, and lets it settle. */
async function toClue(page: Page, clue: number) {
  const round = page.locator('[data-round="mystery"]');
  for (let shown = 1; shown < clue; shown += 1) {
    await page.getByRole("button", { name: /^(Next|Last) clue/ }).click();
    await expect(round).toHaveAttribute("data-clue", String(shown + 1));
  }
  await settle(page);
}

/** How many round actions (guesses, picks, Next clues) reached the mock. */
async function actsSent(mock: RemoteMockControls): Promise<number> {
  return (await mock.responses()).filter(
    (response) => response.method === "sealed.act",
  ).length;
}

test.describe("the clue-4 keys (D20, R2-02)", () => {
  test("R2-02 Dee's repro: once wrong guesses bring the options, typing Cartographer leaves the round open, worth 1, with no reveal", async ({
    page,
    mock,
  }) => {
    await page.clock.setFixedTime(NOV_5);
    const field = await openDaily(page, { width: 1280, height: 800 });
    const round = page.locator('[data-round="mystery"]');
    // Guess wrong until the options show.
    for (const [clue, typed, name] of [
      [1, "Corin", "Corin Ashby"],
      [2, "Thea", "Thea Morrow"],
      [3, "Bram", "Bram Quill"],
    ] as const) {
      await expect(round).toHaveAttribute("data-clue", String(clue));
      await field.fill(typed);
      await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
      await page.getByRole("button", { name: "Guess", exact: true }).click();
    }
    await expect(round).toHaveAttribute("data-clue", "4");
    const group = optionsGroup(page);
    await expect(group).toBeVisible();
    await expect(group).toHaveAccessibleDescription(
      new RegExp(`^${LAST_LEAD}`),
    );
    await settle(page);
    // Focus is on the options group, as the options arrived (D28).
    await expect(group).toBeFocused();
    const before = await actsSent(mock);

    // Dee kept typing a name: "C" locked in option C, and the Mystery was lost.
    await page.keyboard.type("Cartographer");
    await expect(round).toHaveAttribute("data-clue", "4");
    await expect(
      page.getByRole("img", { name: "Worth 1 point now" }),
    ).toBeVisible();
    await expect(page.locator("[data-reveal]")).toHaveCount(0);
    await expect(page.locator("[data-chosen]")).toHaveCount(0);
    for (const option of await optionButtons(page).all()) {
      await expect(option).toHaveAttribute("data-state", "idle");
    }

    // The round is still the player's: Tab to the options, choose B, lock
    // it in, and that is the one round action since the options came.
    await page.keyboard.press("Tab");
    await page.keyboard.press("b");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-reveal]")).toBeVisible();
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R2-02 at clue 4 the legend shows above the options, a key on the heading does nothing, a key chooses, and Enter locks in one pick", async ({
    page,
    mock,
  }) => {
    await openDaily(page, { width: 1280, height: 800 });
    await toClue(page, 4);
    const legend = page.locator("[data-keys-legend]");
    // D28 (amending D20): shown from the moment the options are, where a
    // keyboard is in use (D32): a desk has a mouse, and on a touch device
    // the first key brings it.
    await page.keyboard.press("Shift");
    await expect(legend).toBeVisible();
    await expect(legend).toHaveText(LEGEND);
    const before = await actsSent(mock);

    // A key on the clue's heading: no pick, no mark.
    await page.getByRole("heading", { level: 2 }).click();
    await expect(page.getByRole("heading", { level: 2 })).toBeFocused();
    await page.keyboard.press("c");
    await expect(page.locator("[data-chosen]")).toHaveCount(0);

    // From option A, "c" chooses C: focus moves there and it is marked.
    await page.keyboard.press("Tab");
    const options = optionsGroup(page);
    await expect(options.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("c");
    const c = options.getByRole("button").nth(2);
    await expect(c).toBeFocused();
    await expect(page.locator('[data-chosen][data-option="2"]')).toHaveCount(1);
    // The choice is said (R4-11), and the button under the options names it.
    await expect(page.getByRole("status")).toContainText(
      /chosen\. Enter locks it in\.$/,
    );
    await expect(lockInButton(page)).toHaveAccessibleName(/^Lock in \S/);
    // Its place: under the options' lead and above the options, inside the screen.
    const firstOption = await boxOf(options.getByRole("button").first());
    const line = await boxOf(legend);
    expect(line.bottom).toBeLessThanOrEqual(firstOption.top);
    expect(line.right).toBeLessThanOrEqual(1280);
    await expect(legend).toBeInViewport();

    // The legend stays wherever focus goes, and since D31 so does the mark.
    await page.getByRole("heading", { level: 2 }).click();
    await expect(page.locator('[data-chosen][data-option="2"]')).toHaveCount(1);
    await expect(legend).toBeVisible();
    expect(await actsSent(mock)).toBe(before);

    // Back on the chosen option, Enter: one pick, for C.
    await c.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-reveal]")).toBeVisible();
    await expect(page.locator("[data-reveal]")).toContainText(
      /You picked|Solved on clue 4/,
    );
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R2-02 after Dee's repro and a Tab to the options, typing Odile Marsh or Cartographer sends nothing and shows no reveal", async ({
    page,
    mock,
  }) => {
    await page.clock.setFixedTime(NOV_5);
    const field = await openDaily(page, { width: 1280, height: 800 });
    const round = page.locator('[data-round="mystery"]');
    for (const [clue, typed, name] of [
      [1, "Corin", "Corin Ashby"],
      [2, "Thea", "Thea Morrow"],
      [3, "Bram", "Bram Quill"],
    ] as const) {
      await expect(round).toHaveAttribute("data-clue", String(clue));
      await field.fill(typed);
      await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
      // A hardware Enter, as the reviewer entered them.
      await page.getByRole("button", { name: "Guess", exact: true }).focus();
      await page.keyboard.press("Enter");
    }
    await expect(round).toHaveAttribute("data-clue", "4");
    const group = optionsGroup(page);
    await expect(group).toBeVisible();
    await settle(page);
    await expect(group).toBeFocused();
    const before = await actsSent(mock);

    // Tab, expecting the guess field, lands on option A.
    await page.keyboard.press("Tab");
    await expect(group.getByRole("button").first()).toBeFocused();
    await page.keyboard.type("Odile Marsh");
    await page.keyboard.type("Cartographer");
    await expect(round).toHaveAttribute("data-clue", "4");
    await expect(page.locator("[data-reveal]")).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);
    for (const option of await optionButtons(page).all()) {
      await expect(option).toHaveAttribute("data-state", "idle");
    }
  });

  test("R2-02 at 360 by 640 with 200% text, once a key chooses, the chosen option and the Lock in button that names it are on screen", async ({
    page,
  }) => {
    await openDaily(page, { width: 360, height: 640 });
    await page.addStyleTag({ content: LARGE_TEXT });
    await toClue(page, 4);
    await expect(optionsGroup(page)).toBeFocused();
    // The legend is on screen beside the first option (mystery-rite-3 has
    // A's case). Since D31 the Lock in bar is what stays in sight by C: the
    // chosen option shows whole above it, and the bar names the choice.
    await page.keyboard.press("Tab");
    await page.keyboard.press("c");
    const c = optionButtons(page).nth(2);
    await expect(c).toBeFocused();
    await expect(c).toBeInViewport({ ratio: 1 });
    const bar = lockInButton(page);
    await expect(bar).toBeInViewport({ ratio: 1 });
    await expect(bar).toHaveAccessibleName(
      `Lock in ${(await c.locator(".kn-answer-text").textContent()) ?? ""}`,
    );
    const [option, button] = [await boxOf(c), await boxOf(bar)];
    expect(option.bottom).toBeLessThanOrEqual(button.top);
  });
});

test.describe("See your results after Lock in (R2-12)", () => {
  test("R2-12 at 390 by 844 after Lock in, See your results is inside the viewport with no scroll, under the whole result card", async ({
    page,
  }) => {
    await openDaily(page, { width: 390, height: 844 });
    // Daily #45's Mysteries out on Next clue and option A, to the Encore.
    for (const next of ["Next mystery", "Next mystery", "On to the Encore"]) {
      await toClue(page, 4);
      await pickFirstOption(page);
      await page.getByRole("button", { name: next }).click();
    }
    await expect(page.locator('[data-round="encore"]')).toBeVisible();
    await page.getByRole("textbox", { name: "Your number" }).fill("80");
    await page.getByRole("button", { name: "Lock in" }).click();

    // Priya and Marcus: the button sat below the fold, and nothing scrolled.
    const results = page.getByRole("button", { name: "See your results" });
    await expect(results).toBeVisible();
    await expect(results).toBeInViewport({ ratio: 1 });
    const button = await boxOf(results);
    expect(button.top).toBeGreaterThanOrEqual(0);
    expect(button.bottom).toBeLessThanOrEqual(844);
    // Docked: held at the screen's bottom edge as the result scrolls under it.
    const dockElement = page.locator("[data-encore-dock]");
    expect(
      await dockElement.evaluate(
        (element) => getComputedStyle(element).position,
      ),
    ).toBe("sticky");
    const dock = await boxOf(dockElement);
    expect(dock.bottom).toBeLessThanOrEqual(844 + 0.5);

    // The result came into view with it: its line below the header, and the
    // whole card above the dock.
    const heading = page.getByRole("heading", {
      level: 2,
      name: /^Your guess/,
    });
    await expect(heading).toBeFocused();
    const header = await boxOf(page.locator("header").first());
    const card = await boxOf(page.locator("[data-encore-result]"));
    expect(card.top).toBeGreaterThanOrEqual(header.bottom);
    expect(card.bottom).toBeLessThanOrEqual(dock.top + 0.5);

    // The page scrolls under it, and it still continues.
    await results.click();
    await expect(page).toHaveURL(/\/daily\/45\/results$/);
  });
});

test.describe("the clue ladder at 200% text (R2-17)", () => {
  test("R2-17 at 390 by 844 with 200% text the clue card is at least 80% of the viewport's width, and clue text hyphenates only where written", async ({
    page,
  }) => {
    await openDaily(page, { width: 390, height: 844 });
    await toClue(page, 2);
    const card = page.locator("[data-clue-card]");
    const current = page.locator('[data-rung="current"]');
    // At 100% text the number stays beside the clue.
    const sideNumber = await boxOf(current.locator("[data-rung-number]"));
    expect(sideNumber.right).toBeLessThanOrEqual((await boxOf(card)).left);

    // Sam at 200% text: the gutter took about half the width, and the clue
    // ran two words a line, split as "This fix- / ture coun- / try".
    await page.addStyleTag({ content: LARGE_TEXT });
    await settle(page);
    const wide = await boxOf(card);
    expect(wide.width).toBeGreaterThanOrEqual(0.8 * 390);
    expect(wide.right).toBeLessThanOrEqual(390);
    // The number sits above its clue now.
    const number = await boxOf(current.locator("[data-rung-number]"));
    expect(number.bottom).toBeLessThanOrEqual(wide.top);
    const heading = card.locator("h2");
    expect(
      await heading.evaluate((element) => getComputedStyle(element).hyphens),
    ).toBe("manual");
    // The past clue too, and nothing scrolls sideways.
    expect(
      await page
        .locator('[data-rung="past"] p')
        .first()
        .evaluate((element) => getComputedStyle(element).hyphens),
    ).toBe("manual");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
});
