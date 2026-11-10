/**
 * The Mystery's fixes after RITE round 3 (FIX3-MYS; docs/playtests/rite-3.md
 * §6, §7 and §9; the decisions memo §26, D28), in a real browser on the
 * production build and the mock backend. Each test title starts with the
 * finding it reproduces.
 *
 * Daily #45 (Wednesday 4 November 2026) opens on the fixture film; Daily
 * #46 (Thursday 5 November) opens on a person, Odile Marsh.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import type { RemoteMockControls } from "../support/mock";

/** 09:00 in London on Wednesday 4 November 2026: Daily #45. */
const NOV_4 = new Date("2026-11-04T09:00:00Z");
/** The next day: Daily #46, whose Mystery 1 is a person. */
const NOV_5 = new Date("2026-11-05T09:00:00Z");

/** The phone's text size at 200% (PRD §3.12.4, release criterion R2). */
const LARGE_TEXT = "html { font-size: 200% !important; }";

const LEGEND = "Keys A to D choose. Enter on your choice locks in.";

test.use({ timezoneId: "Europe/London" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOV_4);
});

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

/** Dee's way to clue 4: Next clue three times, each pressed with Enter. */
async function toClue4ByKeyboard(page: Page) {
  const round = page.locator('[data-round="mystery"]');
  for (let shown = 1; shown < 4; shown += 1) {
    await page.getByRole("button", { name: /^(Next|Last) clue/ }).focus();
    await page.keyboard.press("Enter");
    await expect(round).toHaveAttribute("data-clue", String(shown + 1));
  }
  await settle(page);
}

/** The options group, as a screen reader finds it: labelled by clue 4. */
function optionsGroup(page: Page): Locator {
  return page.getByRole("group", { name: /^Clue 4:/ });
}

/** How many round actions (guesses, picks, Next clues) reached the mock. */
async function actsSent(mock: RemoteMockControls): Promise<number> {
  return (await mock.responses()).filter(
    (response) => response.method === "sealed.act",
  ).length;
}

test.describe("clue 4's keys from where focus lands (D28, R3-05)", () => {
  test("R3-05 Dee's test c: on Mystery 1, three Next clues, then A and Enter with no Tab send one pick, for A", async ({
    page,
    mock,
  }) => {
    await openDaily(page, { width: 1280, height: 800 });
    await toClue4ByKeyboard(page);
    const group = optionsGroup(page);
    // Focus is on the options group, labelled by the clue, and the legend
    // shows from the moment the options do.
    await expect(group).toBeFocused();
    await expect(group).toHaveAccessibleDescription(
      `Last clue. Pick one of four. One pick: a wrong one scores 0. ${LEGEND}`,
    );
    const legend = page.locator("[data-keys-legend]");
    await expect(legend).toBeVisible();
    await expect(legend).toHaveText(LEGEND);
    await expect(legend).toBeInViewport();

    const a = group.getByRole("button").first();
    const label = (await a.locator(".kn-answer-text").textContent()) ?? "";
    expect(label).not.toBe("");
    const before = await actsSent(mock);

    // No Tab: A, then Enter.
    await page.keyboard.press("a");
    await expect(a).toBeFocused();
    await expect(a).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    const reveal = page.locator("[data-reveal]");
    await expect(reveal).toBeVisible();
    await expect(reveal).toContainText(label);
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R3-05 the legend's line is reserved: the options don't move when a key or a focus ring reaches them", async ({
    page,
  }) => {
    await openDaily(page, { width: 1280, height: 800 });
    await toClue4ByKeyboard(page);
    const first = optionsGroup(page).getByRole("button").first();
    const legend = page.locator("[data-keys-legend]");
    await expect(legend).toBeVisible();
    const top = (await first.boundingBox())?.y;
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();
    await page.keyboard.press("b");
    await expect(legend).toBeVisible();
    expect((await first.boundingBox())?.y).toBe(top);
    // The legend sits under the lead and above the options.
    const line = await legend.boundingBox();
    const option = await first.boundingBox();
    expect((line?.y ?? 0) + (line?.height ?? 0)).toBeLessThanOrEqual(
      option?.y ?? 0,
    );
  });

  test("R3-05 Dee's test b, kept: at clue 4, typing Cartographer leaves the round open and shows no reveal", async ({
    page,
    mock,
  }) => {
    await openDaily(page, { width: 1280, height: 800 });
    await toClue4ByKeyboard(page);
    await expect(optionsGroup(page)).toBeFocused();
    const before = await actsSent(mock);
    await page.keyboard.type("Cartographer");
    const round = page.locator('[data-round="mystery"]');
    await expect(round).toHaveAttribute("data-clue", "4");
    await expect(page.locator("[data-reveal]")).toHaveCount(0);
    await expect(page.locator("[data-chosen]")).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);
  });

  test("R3-05 once wrong guesses bring the options, typing Odile Marsh, a name with a space, sends nothing", async ({
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
      await page.getByRole("button", { name: "Guess", exact: true }).click();
    }
    await expect(round).toHaveAttribute("data-clue", "4");
    await settle(page);
    await expect(optionsGroup(page)).toBeFocused();
    const before = await actsSent(mock);
    await page.keyboard.type("Odile Marsh");
    await expect(round).toHaveAttribute("data-clue", "4");
    await expect(page.locator("[data-reveal]")).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);
  });

  test("R3-05 on a 390 by 844 phone, clue 4 opens with the legend on screen above option A", async ({
    page,
  }) => {
    await openDaily(page, { width: 390, height: 844 });
    await toClue4ByKeyboard(page);
    await expect(optionsGroup(page)).toBeFocused();
    const legend = page.locator("[data-keys-legend]");
    await expect(legend).toBeInViewport({ ratio: 1 });
    const line = await legend.boundingBox();
    const a = await optionsGroup(page)
      .getByRole("button")
      .first()
      .boundingBox();
    expect((line?.y ?? 0) + (line?.height ?? 0)).toBeLessThanOrEqual(a?.y ?? 0);
  });

  test("R3-05 at 360 by 640 with 200% text, A from the group brings option A and the legend on screen", async ({
    page,
  }) => {
    // Clue 4 opens with its clue in view first (R1-33); at this size its
    // card fills the screen, so the legend and options follow the key.
    await openDaily(page, { width: 360, height: 640 });
    await page.addStyleTag({ content: LARGE_TEXT });
    await toClue4ByKeyboard(page);
    await expect(optionsGroup(page)).toBeFocused();
    await page.keyboard.press("a");
    const a = optionsGroup(page).getByRole("button").first();
    await expect(a).toBeFocused();
    await expect(a).toBeInViewport();
    await expect(a).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-keys-legend]")).toBeInViewport({
      ratio: 1,
    });
  });

  test("R3-05 at 320 by 568 with 200% text, Space on the group clue 4 focuses scrolls the page", async ({
    page,
  }) => {
    // The options sit below the fold here; Space is a sighted keyboard
    // user's scroll key, and the typing guard doesn't need it.
    await openDaily(page, { width: 320, height: 568 });
    await page.addStyleTag({ content: LARGE_TEXT });
    await toClue4ByKeyboard(page);
    await expect(optionsGroup(page)).toBeFocused();
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press(" ");
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(before);
    await expect(optionsGroup(page)).toBeFocused();
    await expect(page.locator("[data-reveal]")).toHaveCount(0);
  });
});

test.describe("Enter after a typed name (D20's typing guard, R3-05 after review)", () => {
  /** Longer than the options' typing window (`TYPING_MS`, 800 ms). */
  const PAUSE_MS = 1000;

  for (const name of ["Cartographer", "Bram", "Mira Tolland"]) {
    test(`R3-05 from where clue 4 puts focus, ${name} then Enter sends no pick, nor does Enter after a pause`, async ({
      page,
      mock,
    }) => {
      await openDaily(page, { width: 1280, height: 800 });
      await toClue4ByKeyboard(page);
      await expect(optionsGroup(page)).toBeFocused();
      const before = await actsSent(mock);
      await page.keyboard.type(name);
      await page.keyboard.press("Enter");
      const round = page.locator('[data-round="mystery"]');
      await expect(round).toHaveAttribute("data-clue", "4");
      await expect(page.locator("[data-chosen]")).toHaveCount(0);
      await page.waitForTimeout(PAUSE_MS);
      await page.keyboard.press("Enter");
      await expect(round).toHaveAttribute("data-clue", "4");
      await expect(page.locator("[data-reveal]")).toHaveCount(0);
      expect(await actsSent(mock)).toBe(before);
    });
  }

  test("R3-05 Tab, then Odile Marsh and Enter, sends nothing", async ({
    page,
    mock,
  }) => {
    await openDaily(page, { width: 1280, height: 800 });
    await toClue4ByKeyboard(page);
    await page.keyboard.press("Tab");
    await expect(optionsGroup(page).getByRole("button").first()).toBeFocused();
    const before = await actsSent(mock);
    await page.keyboard.type("Odile Marsh");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-round="mystery"]')).toHaveAttribute(
      "data-clue",
      "4",
    );
    await expect(page.locator("[data-reveal]")).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);
  });

  test("R3-05 cc sends nothing since D31, and Enter then sends one pick, for C", async ({
    page,
    mock,
  }) => {
    await openDaily(page, { width: 1280, height: 800 });
    await toClue4ByKeyboard(page);
    const c = optionsGroup(page).getByRole("button").nth(2);
    const label = (await c.locator(".kn-answer-text").textContent()) ?? "";
    const before = await actsSent(mock);
    await page.keyboard.press("c");
    await expect(c).toBeFocused();
    await page.keyboard.press("c");
    await expect(c).toHaveAttribute("aria-pressed", "true");
    expect(await actsSent(mock)).toBe(before);
    await page.keyboard.press("Enter");
    const reveal = page.locator("[data-reveal]");
    await expect(reveal).toBeVisible();
    await expect(reveal).toContainText(label);
    expect(await actsSent(mock)).toBe(before + 1);
  });
});

test.describe("screen-reader text (R3-09)", () => {
  test("R3-09 the Mystery's kicker reads Mystery 1 of 3, Easy, with no stray separators", async ({
    page,
  }) => {
    await openDaily(page, { width: 1280, height: 800 });
    const kicker = page.locator('[data-round="mystery"] [data-kicker]');
    // The accessibility tree, as Sam's screen reader reads it.
    await expect(kicker).toMatchAriaSnapshot(
      `- paragraph: "Mystery 1 of 3, Easy"`,
    );
    // Nor does the dot reach the page's text, read aloud or copied.
    expect(await kicker.innerText()).not.toMatch(/·|\s,/);
    // It is still drawn, in the gap before Easy.
    const dot = kicker.locator("[data-kicker-dot]");
    expect(
      await dot.evaluate(
        (element) => getComputedStyle(element, "::before").content,
      ),
    ).toMatch(/·/);
  });

  test("R3-09 a chosen clue-4 option is aria-pressed, and only that one", async ({
    page,
  }) => {
    await openDaily(page, { width: 1280, height: 800 });
    await toClue4ByKeyboard(page);
    const buttons = optionsGroup(page).getByRole("button");
    await page.keyboard.press("b");
    await expect(buttons.nth(1)).toBeFocused();
    await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
    for (const position of [0, 2, 3]) {
      await expect(buttons.nth(position)).not.toHaveAttribute("aria-pressed");
    }
  });
});

test.describe("Escape in the suggestion list (R3-14)", () => {
  test("R3-14 Marcus: Escape closes the suggestion list and keeps the text, and a second Escape clears the field", async ({
    page,
  }) => {
    const field = await openDaily(page, { width: 1280, height: 800 });
    await field.click();
    await page.keyboard.type("the");
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    await expect(field).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    await expect(field).toHaveValue("the");
    await expect(field).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(field).toHaveValue("");
    await expect(list).toBeHidden();
  });

  test("R3-14 Escape closes the list after the arrows highlight a row, too", async ({
    page,
  }) => {
    const field = await openDaily(page, { width: 390, height: 844 });
    await field.click();
    await page.keyboard.type("the");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await expect(field).toHaveValue("the");
  });
});
