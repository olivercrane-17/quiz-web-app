/**
 * The Mystery's and the Encore's fixes after RITE round 4 (FIX4-MYS;
 * docs/playtests/rite-4.md §6, §7 and §9; the decisions memo §27, D31 and
 * D32), in a real browser on the production build and the mock backend.
 * Each test title starts with the finding it reproduces.
 *
 * Daily #51 (Tuesday 10 November 2026) is round 4's own: The Lantern
 * Keeper, Cobalt, Arvenna, then the Encore. Daily #45 (Wednesday 4
 * November) opens on the fixture film, whose suggestions carry years.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { expectNoSeriousAxe } from "../support/axe";
import type { RemoteMockControls } from "../support/mock";
import {
  lockInButton,
  optionButtons,
  pickFirstOption,
  pickOption,
} from "./clue-4";

/** 09:00 in London on Tuesday 10 November 2026: Daily #51. */
const NOV_10 = new Date("2026-11-10T09:00:00Z");
/** 09:00 in London on Wednesday 4 November 2026: Daily #45. */
const NOV_4 = new Date("2026-11-04T09:00:00Z");

const LAST_LEAD =
  "Last clue. Pick one of four. One pick: a wrong one scores 0.";
const KEYS = "Keys A to D choose. Enter locks in.";
const TAP = "Tap one, then Lock in.";
const TYPED = "Typing chooses nothing. Press Esc, then A to D.";
const LEAVE_RUNNING =
  "Leave the Daily. Your progress is saved, and the stopwatch keeps running.";

/** The phone's text size at 200% (PRD §3.12.4, release criterion R2). */
const LARGE_TEXT = "html { font-size: 200% !important; }";
/** The phone's text size at `percent`. */
const textAt = (percent: number) =>
  `html { font-size: ${String(percent)}% !important; }`;

/** A desk: a mouse that hovers, so a keyboard is likely (D32). */
const DESK = {
  viewport: { width: 1280, height: 800 },
  hasTouch: false,
  isMobile: false,
} as const;
/** The small phone of release criterion R2: touch only. */
const SMALL_PHONE = {
  viewport: { width: 360, height: 640 },
  hasTouch: true,
  isMobile: true,
} as const;
/** Priya's, Marcus's and Lena's phone: touch only. */
const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
} as const;

test.use({ timezoneId: "Europe/London" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOV_10);
});

const round = (page: Page) => page.locator('[data-round="mystery"]');
const reveal = (page: Page) => page.locator("[data-reveal]");
const legend = (page: Page) => page.locator("[data-keys-legend]");
const status = (page: Page) => page.locator("#qz-live-polite");
/** The options group, as a screen reader finds it: labelled by clue 4. */
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

/** Mystery 1 out on its right option, then Mystery 2 to its last clue. */
async function toMystery2Clue4(page: Page) {
  await openDaily(page);
  await toClue4(page);
  await pickOption(page, "The Lantern Keeper");
  await page.getByRole("button", { name: "Next mystery" }).click();
  await expect(round(page)).toHaveAttribute("data-clue", "1");
  await toClue4(page);
}

/** The label an option shows, without its letter. */
async function labelOf(option: Locator): Promise<string> {
  const label = (await option.locator(".kn-answer-text").textContent()) ?? "";
  expect(label).not.toBe("");
  return label;
}

/** How many round actions (guesses, picks, Next clues) reached the mock. */
async function actsSent(mock: RemoteMockControls): Promise<number> {
  return (await mock.responses()).filter(
    (response) => response.method === "sealed.act",
  ).length;
}

const topOf = async (locator: Locator) => (await locator.boundingBox())?.y;

/** Leave by the X while a clue is open, then Continue from Today's card. */
async function leaveAndContinue(page: Page) {
  await page.getByRole("link", { name: LEAVE_RUNNING }).click();
  await expect(page).toHaveURL("/");
  await page
    .locator('[data-daily-card="in_progress"]')
    .getByRole("link", { name: "Continue" })
    .click();
  await expect(page).toHaveURL("/daily");
  await expect(optionsGroup(page)).toBeVisible();
  await settle(page);
}

const lockInBar = (page: Page) => page.locator("[data-lock-in-bar]");

/** Where the page's layout stands: the Lock in bar's box and the document's height. */
async function layoutOf(page: Page) {
  return {
    bar: await lockInBar(page).boundingBox(),
    height: await page.evaluate(() => document.documentElement.scrollHeight),
  };
}

test.describe("one way to lock in at clue 4, on a touch phone (D31, R4-01)", () => {
  test.use(PHONE);

  test("R4-01 Priya's and Marcus's path: on Mystery 2's last clue a tap on A only chooses, a tap on B moves the mark, and Lock in sends one pick, for B", async ({
    page,
    mock,
  }) => {
    await toMystery2Clue4(page);
    // A touch-only device: nothing here hovers.
    expect(
      await page.evaluate(
        () => matchMedia("(hover: hover) and (pointer: fine)").matches,
      ),
    ).toBe(false);
    const [a, b] = [optionButtons(page).nth(0), optionButtons(page).nth(1)];
    const lockIn = lockInButton(page);
    const bLabel = await labelOf(b);
    const before = await actsSent(mock);

    // The line says what is true on this phone, and no key legend shows.
    await expect(legend(page)).toHaveText(TAP);
    await expect(optionsGroup(page)).toHaveAccessibleDescription(
      `${LAST_LEAD} ${TAP}`,
    );
    await expect(page.getByText(KEYS)).toBeHidden();
    // Lock in is there from the start, under the thumb, and can't send yet.
    await expect(lockIn).toBeInViewport({ ratio: 1 });
    await expect(lockIn).toHaveAccessibleName("Lock in");
    await expect(lockIn).toHaveAttribute("aria-disabled", "true");
    const place = await lockIn.boundingBox();
    // The options' own rows: a pressed button sinks 2 px inside its row.
    const rows = page.locator("[data-options] [data-option]");
    const tops = [await topOf(rows.nth(0)), await topOf(rows.nth(1))];

    await a.tap();
    // The round is still open: no reveal, the stake still reads 1.
    await expect(a).toHaveAttribute("aria-pressed", "true");
    await expect(lockIn).toBeEnabled();
    await expect(lockIn).not.toHaveAttribute("aria-disabled");
    await expect(lockIn).toHaveAccessibleName(`Lock in ${await labelOf(a)}`);
    await expect(reveal(page)).toHaveCount(0);
    await expect(
      page.getByRole("img", { name: "Worth 1 point now" }),
    ).toBeVisible();
    await expect(status(page)).toHaveText(`${await labelOf(a)} chosen.`);

    await b.tap();
    await expect(b).toHaveAttribute("aria-pressed", "true");
    await expect(a).not.toHaveAttribute("aria-pressed");
    await expect(lockIn).toHaveAccessibleName(`Lock in ${bLabel}`);
    await expect(reveal(page)).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);
    // Nothing moved: the options and the button are where they were.
    expect([await topOf(rows.nth(0)), await topOf(rows.nth(1))]).toEqual(tops);
    const now = await lockIn.boundingBox();
    expect(now?.y).toBe(place?.y);
    expect(now?.height).toBe(place?.height);

    await lockIn.tap();
    await expect(reveal(page)).toBeVisible();
    await expect(reveal(page)).toContainText(bLabel);
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R4-01 Lena's path: the c key, then a tap on A; A is pressed, C isn't, and no reveal shows", async ({
    page,
    mock,
  }) => {
    await toMystery2Clue4(page);
    const [a, c] = [optionButtons(page).nth(0), optionButtons(page).nth(2)];
    const before = await actsSent(mock);
    await expect(optionsGroup(page)).toBeFocused();
    await expect(legend(page)).toHaveText(TAP);
    const top = await topOf(a);

    // A key from a keyboard paired with the phone.
    await page.keyboard.press("c");
    await expect(c).toHaveAttribute("aria-pressed", "true");
    // Now a keyboard is in use, the same line says how its keys work, and
    // the options haven't moved (R4-03).
    await expect(legend(page)).toHaveText(KEYS);
    expect(await topOf(a)).toBe(top);

    await a.tap();
    await expect(a).toHaveAttribute("aria-pressed", "true");
    await expect(c).not.toHaveAttribute("aria-pressed");
    await expect(reveal(page)).toHaveCount(0);
    await expect(round(page)).toHaveAttribute("data-clue", "4");
    expect(await actsSent(mock)).toBe(before);
    // What she meant goes out when she says so.
    await lockInButton(page).tap();
    await expect(reveal(page)).toContainText(await labelOf(a));
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R4-01 two quick taps on one option send nothing, and the chosen clue 4 passes axe", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    const d = optionButtons(page).nth(3);
    const before = await actsSent(mock);
    await d.tap();
    await d.tap();
    await expect(d).toHaveAttribute("aria-pressed", "true");
    await expect(reveal(page)).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);
    await expectNoSeriousAxe(page);
  });

  test("R4-01 at 200% text the Lock in button stays on screen through a choice, and the chosen option can be read above it", async ({
    page,
  }) => {
    await openDaily(page);
    await page.addStyleTag({ content: LARGE_TEXT });
    await toClue4(page);
    const lockIn = lockInButton(page);
    await expect(lockIn).toBeInViewport({ ratio: 1 });
    const a = optionButtons(page).first();
    // The player scrolls A to the middle of the screen, clear of the bar.
    await a.evaluate((element) => {
      element.scrollIntoView({ block: "center" });
    });
    const scrolled = await page.evaluate(() => window.scrollY);
    const layout = await layoutOf(page);
    await a.tap();
    await expect(a).toHaveAttribute("aria-pressed", "true");
    // The tap moved nothing, and the bar now names the choice: it is as
    // tall as it was, where it was, and the page is no taller.
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    expect(await layoutOf(page)).toEqual(layout);
    await expect(lockIn).toBeInViewport({ ratio: 1 });
    await expect(lockIn).toHaveAccessibleName(`Lock in ${await labelOf(a)}`);
    await expect(a).toBeInViewport({ ratio: 1 });
    const [option, button] = [
      await a.boundingBox(),
      await lockIn.boundingBox(),
    ];
    expect((option?.y ?? 0) + (option?.height ?? 0)).toBeLessThanOrEqual(
      button?.y ?? 0,
    );
    // Nothing runs off the side.
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test("R4-01 the Lock in label is one line: a long name is cut short on screen and whole in the button's name", async ({
    page,
  }) => {
    await openDaily(page);
    await page.addStyleTag({ content: LARGE_TEXT });
    await toClue4(page);
    const lockIn = lockInButton(page);
    const plain = await lockIn.boundingBox();
    for (const option of await optionButtons(page).all()) {
      await option.evaluate((element) => {
        element.scrollIntoView({ block: "center" });
      });
      await option.tap();
      await expect(lockIn).toHaveAccessibleName(
        `Lock in ${await labelOf(option)}`,
      );
      expect((await lockIn.boundingBox())?.height).toBe(plain?.height);
    }
  });

  test("R4-14 R4-15 on the phone no key hint shows on a reveal or beside the Encore's field", async ({
    page,
  }) => {
    await openDaily(page);
    for (const next of ["Next mystery", "Next mystery", "On to the Encore"]) {
      await toClue4(page);
      await expect(legend(page)).toHaveText(TAP);
      await pickFirstOption(page);
      await expect(reveal(page)).toBeVisible();
      await expect(page.locator("[data-enter-hint]")).toHaveCount(0);
      await page.getByRole("button", { name: next }).click();
    }
    const field = page.getByRole("textbox", { name: "Your number" });
    await expect(field).toBeVisible();
    await field.fill("80");
    await expect(page.locator("[data-enter-hint]")).toHaveCount(0);
    await expect(field).not.toHaveAccessibleDescription(/Enter locks in/);
  });
});

test.describe("the Lock in bar at large text on a small phone (D31, R4-01, after review)", () => {
  test.use(SMALL_PHONE);

  for (const percent of [100, 150, 200]) {
    test(`R4-01 at ${String(percent)}% text a double tap on the option just above the bar sends nothing, and the bar and the page keep their size`, async ({
      page,
      mock,
    }) => {
      await openDaily(page);
      await page.addStyleTag({ content: textAt(percent) });
      await toClue4(page);
      // Scroll until an option lies 12 px above the docked bar, mid-screen.
      const found = await page.evaluate(() => {
        const bar = document.querySelector("[data-lock-in-bar]");
        const limit =
          document.documentElement.scrollHeight - window.innerHeight;
        for (let top = 0; top <= limit; top += 8) {
          window.scrollTo(0, top);
          const y = (bar?.getBoundingClientRect().top ?? 0) - 12;
          if (y <= 0 || y >= window.innerHeight) continue;
          const item = document
            .elementFromPoint(180, y)
            ?.closest<HTMLElement>("[data-options] [data-option]");
          if (item?.dataset.option !== undefined) {
            return { x: 180, y, index: item.dataset.option };
          }
        }
        return null;
      });
      expect(found).not.toBeNull();
      const point = { x: found?.x ?? 0, y: found?.y ?? 0 };
      const index = found?.index ?? "";
      const optionAtPoint = () =>
        page.evaluate(({ x, y }) => {
          const item = document
            .elementFromPoint(x, y)
            ?.closest<HTMLElement>("[data-options] [data-option]");
          return item?.dataset.option ?? null;
        }, point);
      const layout = await layoutOf(page);
      const before = await actsSent(mock);

      await page.touchscreen.tap(point.x, point.y);
      await page.touchscreen.tap(point.x, point.y);

      await expect(
        page.locator(`[data-options] [data-option="${index}"]`),
      ).toHaveAttribute("data-chosen", "");
      // The second tap landed where the first did: still on the option.
      expect(await optionAtPoint()).toBe(index);
      expect(await layoutOf(page)).toEqual(layout);
      await expect(lockInButton(page)).toHaveAccessibleName(/^Lock in ./);
      await expect(reveal(page)).toHaveCount(0);
      await expect(round(page)).toHaveAttribute("data-clue", "4");
      expect(await actsSent(mock)).toBe(before);
      // The button still sends the one pick.
      await lockInButton(page).tap();
      await expect(reveal(page)).toBeVisible();
      expect(await actsSent(mock)).toBe(before + 1);
    });
  }

  test("R4-01 at 200% text, on arrival at clue 4, the bar covers neither the last-clue line nor the legend, and never sits above option A", async ({
    page,
  }) => {
    await openDaily(page);
    await page.addStyleTag({ content: LARGE_TEXT });
    await toClue4(page);
    const covered = () =>
      page.evaluate(() => {
        const hits: string[] = [];
        for (const selector of ["[data-options-lead]", "[data-keys-legend]"]) {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          if (box === undefined) {
            hits.push(`${selector} missing`);
            continue;
          }
          const from = Math.max(box.top, 0) + 1;
          const to = Math.min(box.bottom, window.innerHeight) - 1;
          for (let y = from; y <= to; y += 4) {
            const at = document.elementFromPoint(box.left + 8, y);
            if (at?.closest("[data-lock-in-bar]") != null) {
              hits.push(`${selector} at ${String(Math.round(y))}`);
            }
          }
        }
        return hits;
      });
    const barAboveA = async () => {
      const [bar, a] = [
        await lockInBar(page).boundingBox(),
        await optionButtons(page).first().boundingBox(),
      ];
      return (bar?.y ?? 0) < (a?.y ?? 0);
    };
    expect(await covered()).toEqual([]);
    expect(await barAboveA()).toBe(false);
    // And wherever the page is scrolled to.
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    for (let y = 0; y < height; y += 80) {
      await page.evaluate((top) => {
        window.scrollTo(0, top);
      }, y);
      expect(await covered()).toEqual([]);
      expect(await barAboveA()).toBe(false);
    }
  });
});

test.describe("the options and the Lock in bar on arrival at clue 4 (D31, DESIGN 6.2, integration 9)", () => {
  /** Each option's box and the bar's, and where the header ends. */
  const arrival = (page: Page) =>
    page.evaluate(() => {
      const box = (element: Element | null) => {
        const rect = element?.getBoundingClientRect();
        return rect === undefined
          ? null
          : { top: rect.top, bottom: rect.bottom };
      };
      return {
        options: [
          ...document.querySelectorAll("[data-options] [data-option]"),
        ].map((item) => box(item)),
        bar: box(document.querySelector("[data-lock-in-bar]")),
        lead: box(document.querySelector("[data-options-lead]")),
        header: Math.max(
          0,
          ...[...document.querySelectorAll("header")].map(
            (header) => header.getBoundingClientRect().bottom,
          ),
        ),
        viewport: window.innerHeight,
      };
    });

  for (const [name, device, percent] of [
    ["390 by 844", PHONE, 100],
    ["390 by 844", PHONE, 150],
    ["360 by 640", SMALL_PHONE, 100],
  ] as const) {
    test.describe(`${name} at ${String(percent)}% text`, () => {
      test.use(device);

      test(`D31 at ${name} and ${String(percent)}% text, where the group fits under the header, all four options show in full above the Lock in bar on arrival`, async ({
        page,
      }) => {
        await openDaily(page);
        await page.addStyleTag({ content: textAt(percent) });
        await toClue4(page);
        const at = await arrival(page);
        expect(at.options).toHaveLength(4);
        const barTop = at.bar?.top ?? 0;
        expect(at.bar?.bottom).toBeLessThanOrEqual(at.viewport);
        for (const option of at.options) {
          expect(option?.top).toBeGreaterThanOrEqual(at.header);
          expect(option?.bottom).toBeLessThanOrEqual(barTop);
        }
        // The line that says one pick, and a wrong one scores 0, shows too.
        expect(at.lead?.top).toBeGreaterThanOrEqual(at.header);
      });
    });
  }

  test.describe("B chosen by touch, then Leave and Continue", () => {
    test.use(PHONE);

    test("R4-11 on the phone a tapped choice is not marked on return, and Lock in is plain and disabled", async ({
      page,
      mock,
    }) => {
      await openDaily(page);
      await toClue4(page);
      await optionButtons(page).nth(1).tap();
      await expect(lockInButton(page)).toHaveAccessibleName(/^Lock in ./);
      const before = await actsSent(mock);
      await leaveAndContinue(page);
      await expect(page.locator("[data-chosen]")).toHaveCount(0);
      await expect(lockInButton(page)).toHaveAccessibleName("Lock in");
      // Disabled, so the tap is forced: it still sends nothing.
      await expect(lockInButton(page)).toHaveAttribute("aria-disabled", "true");
      await lockInButton(page).tap({ force: true });
      await expect(reveal(page)).toHaveCount(0);
      expect(await actsSent(mock)).toBe(before);
    });
  });
});

test.describe("one way to lock in at clue 4, with a keyboard (D31, R4-01, R4-11)", () => {
  test.use(DESK);

  test("R4-01 Sam's path: a, Tab, Enter leaves the round open with B chosen and said; Enter again sends B", async ({
    page,
    mock,
  }) => {
    await toMystery2Clue4(page);
    const [a, b] = [optionButtons(page).nth(0), optionButtons(page).nth(1)];
    const bLabel = await labelOf(b);
    const before = await actsSent(mock);
    await expect(optionsGroup(page)).toBeFocused();
    // A desk has a mouse: the key legend shows from the start (D32).
    await expect(legend(page)).toHaveText(KEYS);
    await expect(optionsGroup(page)).toHaveAccessibleDescription(
      `${LAST_LEAD} ${KEYS}`,
    );

    await page.keyboard.press("a");
    await expect(a).toBeFocused();
    await expect(a).toHaveAttribute("aria-pressed", "true");
    // Tab, to read the next option: the mark stays on A.
    await page.keyboard.press("Tab");
    await expect(b).toBeFocused();
    await expect(a).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    // B wasn't the chosen one, so Enter chose it and sent nothing.
    await expect(b).toHaveAttribute("aria-pressed", "true");
    await expect(a).not.toHaveAttribute("aria-pressed");
    await expect(status(page)).toHaveText(
      `${bLabel} chosen. Enter locks it in.`,
    );
    await expect(reveal(page)).toHaveCount(0);
    await expect(round(page)).toHaveAttribute("data-clue", "4");
    expect(await actsSent(mock)).toBe(before);

    await page.keyboard.press("Enter");
    await expect(reveal(page)).toBeVisible();
    await expect(reveal(page)).toContainText(bLabel);
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R4-01 a click chooses and Space chooses; neither sends, and the Lock in button, reached by Tab, does", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    const options = optionButtons(page);
    const lockIn = lockInButton(page);
    const before = await actsSent(mock);
    await options.nth(2).click();
    await expect(options.nth(2)).toHaveAttribute("aria-pressed", "true");
    // The click took focus with it, so Enter would be for C as well.
    await expect(options.nth(2)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(options.nth(1)).toBeFocused();
    // Space is a button's own key: here it chooses, coming down or up.
    await page.keyboard.press(" ");
    await expect(options.nth(1)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press(" ");
    await expect(options.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(reveal(page)).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);
    // Tab past C and D to the button, which names the choice.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(lockIn).toBeFocused();
    await expect(lockIn).toHaveAccessibleName(
      `Lock in ${await labelOf(options.nth(1))}`,
    );
    await expectNoSeriousAxe(page);
    await page.keyboard.press("Enter");
    await expect(reveal(page)).toBeVisible();
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R4-11 Dee's reload: after a reload at clue 4 focus is on the options group, and A then Enter with no Tab locks A in", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    await page.reload();
    const group = optionsGroup(page);
    await expect(group).toBeVisible();
    await expect(group).toBeFocused();
    expect(
      await page.evaluate(() =>
        document.activeElement?.hasAttribute("data-options"),
      ),
    ).toBe(true);
    await expect(legend(page)).toHaveText(KEYS);
    const a = optionButtons(page).first();
    const label = await labelOf(a);
    const before = await actsSent(mock);
    await page.keyboard.press("a");
    await expect(a).toHaveAttribute("aria-pressed", "true");
    // A letter key says what it chose (R4-11d).
    await expect(status(page)).toHaveText(
      `${label} chosen. Enter locks it in.`,
    );
    expect(await actsSent(mock)).toBe(before);
    await page.keyboard.press("Enter");
    await expect(reveal(page)).toBeVisible();
    await expect(reveal(page)).toContainText(label);
    expect(await actsSent(mock)).toBe(before + 1);
  });

  for (const word of ["Abba", "Dada", "Add"]) {
    test(`R4-11 ${word} then Enter, typed where clue 4 puts focus, locks nothing`, async ({
      page,
      mock,
    }) => {
      await openDaily(page);
      await toClue4(page);
      await expect(optionsGroup(page)).toBeFocused();
      const before = await actsSent(mock);
      await page.keyboard.type(word, { delay: 80 });
      await page.keyboard.press("Enter");
      await expect(page.locator("[data-chosen]")).toHaveCount(0);
      await expect(lockInButton(page)).toHaveAccessibleName("Lock in");
      await expect(reveal(page)).toHaveCount(0);
      await expect(round(page)).toHaveAttribute("data-clue", "4");
      // No stale "chosen" line is left in the status region.
      await expect(status(page)).not.toContainText("chosen");
      expect(await actsSent(mock)).toBe(before);
    });
  }

  // Integration 9: a word is a word at any pace (the verifier's desk runs).
  for (const word of ["Abba", "Add"]) {
    test(`R4-11 ${word} at 900 ms a key, then Enter, locks nothing, and the legend says the keys are off until Esc`, async ({
      page,
      mock,
    }) => {
      await openDaily(page);
      await toClue4(page);
      await expect(optionsGroup(page)).toBeFocused();
      const before = await actsSent(mock);
      const legendBox = await legend(page).boundingBox();
      const firstTop = await topOf(optionButtons(page).first());
      await page.keyboard.type(word, { delay: 900 });
      await expect(page.locator("[data-chosen]")).toHaveCount(0);
      await expect(status(page)).toHaveText(TYPED);
      await expect(legend(page)).toHaveText(TYPED);
      // The line kept its room: nothing under it moved.
      expect((await legend(page).boundingBox())?.height).toBe(
        legendBox?.height,
      );
      expect(await topOf(optionButtons(page).first())).toBe(firstTop);
      await page.waitForTimeout(900);
      await page.keyboard.press("Enter");
      await expect(lockInButton(page)).toHaveAccessibleName("Lock in");
      await expect(reveal(page)).toHaveCount(0);
      await expect(round(page)).toHaveAttribute("data-clue", "4");
      expect(await actsSent(mock)).toBe(before);
      // Esc, then A and Enter: the keys are back, and A is locked in.
      await page.keyboard.press("Escape");
      await expect(legend(page)).toHaveText(KEYS);
      await page.keyboard.press("a");
      await expect(optionButtons(page).first()).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.keyboard.press("Enter");
      await expect(reveal(page)).toBeVisible();
      expect(await actsSent(mock)).toBe(before + 1);
    });
  }

  for (const word of ["Arvenna", "Mira Tolland"]) {
    test(`R4-11 ${word} at 120 ms a key with a 1 s pause before the last letter, then Enter, locks nothing`, async ({
      page,
      mock,
    }) => {
      await openDaily(page);
      await toClue4(page);
      await expect(optionsGroup(page)).toBeFocused();
      const before = await actsSent(mock);
      await page.keyboard.type(word.slice(0, -1), { delay: 120 });
      await page.waitForTimeout(1_000);
      await page.keyboard.press(word.slice(-1));
      await expect(page.locator("[data-chosen]")).toHaveCount(0);
      await expect(status(page)).not.toContainText("chosen");
      await page.keyboard.press("Enter");
      await expect(lockInButton(page)).toHaveAccessibleName("Lock in");
      await expect(reveal(page)).toHaveCount(0);
      expect(await actsSent(mock)).toBe(before);
    });
  }

  test("R4-11 a, a 1 s pause, b, Enter is still a change of mind: B is locked in", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    const before = await actsSent(mock);
    const b = optionButtons(page).nth(1);
    const label = await labelOf(b);
    await page.keyboard.press("a");
    await page.waitForTimeout(1_000);
    await page.keyboard.press("b");
    await expect(b).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await expect(reveal(page)).toBeVisible();
    await expect(reveal(page)).toContainText(label);
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R4-11 Leave, then Continue at clue 4: focus is on the options group, and A then Enter with no Tab locks A in", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    await leaveAndContinue(page);
    await expect(optionsGroup(page)).toBeFocused();
    await expect(legend(page)).toHaveText(KEYS);
    const a = optionButtons(page).first();
    const label = await labelOf(a);
    const before = await actsSent(mock);
    await page.keyboard.press("a");
    await expect(a).toHaveAttribute("aria-pressed", "true");
    await expect(status(page)).toHaveText(
      `${label} chosen. Enter locks it in.`,
    );
    await page.keyboard.press("Enter");
    await expect(reveal(page)).toBeVisible();
    await expect(reveal(page)).toContainText(label);
    expect(await actsSent(mock)).toBe(before + 1);
  });

  test("R4-11 B chosen, then Leave and Continue: nothing is chosen on return, as after a reload, and Enter sends nothing", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    await page.keyboard.press("b");
    await expect(optionButtons(page).nth(1)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const before = await actsSent(mock);
    await leaveAndContinue(page);
    await expect(optionsGroup(page)).toBeFocused();
    await expect(page.locator("[data-chosen]")).toHaveCount(0);
    await expect(
      page.locator('[data-options] [aria-pressed="true"]'),
    ).toHaveCount(0);
    await expect(lockInButton(page)).toHaveAccessibleName("Lock in");
    await expect(lockInButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(status(page)).not.toContainText("chosen");
    await page.keyboard.press("Enter");
    // Disabled, so the click is forced: it still sends nothing.
    await lockInButton(page).click({ force: true });
    await expect(reveal(page)).toHaveCount(0);
    await expect(round(page)).toHaveAttribute("data-clue", "4");
    expect(await actsSent(mock)).toBe(before);
  });

  test("R4-11 the same letter twice no longer locks in", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    const before = await actsSent(mock);
    await page.keyboard.press("b");
    await page.keyboard.press("b");
    await expect(optionButtons(page).nth(1)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(reveal(page)).toHaveCount(0);
    expect(await actsSent(mock)).toBe(before);
  });

  test("R4-14 Dee's path: on a reveal the answer says Enter continues; Enter, then Tab, then Enter leaves Mystery 2 worth 4", async ({
    page,
    mock,
  }) => {
    await openDaily(page);
    await toClue4(page);
    await pickOption(page, "The Lantern Keeper");
    await expect(reveal(page)).toBeVisible();
    const answer = reveal(page).getByRole("heading", { level: 1 });
    await expect(answer).toBeFocused();
    // What Enter does here is on screen, by the button, and read with the answer.
    const hint = reveal(page).locator("[data-enter-hint]");
    await expect(hint).toHaveText("Enter continues.");
    await expect(answer).toHaveAccessibleDescription("Enter continues.");
    const next = page.getByRole("button", { name: "Next mystery" });
    const [button, line] = [await next.boundingBox(), await hint.boundingBox()];
    expect(line?.y ?? 0).toBeGreaterThanOrEqual(
      (button?.y ?? 0) + (button?.height ?? 0),
    );

    await page.keyboard.press("Enter");
    await expect(round(page)).toHaveAttribute("data-clue", "1");
    await expect(
      page.getByRole("img", { name: "Worth 4 points now" }),
    ).toBeVisible();
    const before = await actsSent(mock);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    // Nothing was spent: Mystery 2 is on clue 1, still worth 4.
    await expect(round(page)).toHaveAttribute("data-clue", "1");
    await expect(
      page.getByRole("img", { name: "Worth 4 points now" }),
    ).toBeVisible();
    expect(await actsSent(mock)).toBe(before);
  });

  test("R4-15 beside the Encore's field Enter locks in. shows and is in the field's description, and Enter does lock in", async ({
    page,
  }) => {
    await openDaily(page);
    for (const next of ["Next mystery", "Next mystery", "On to the Encore"]) {
      await toClue4(page);
      await pickFirstOption(page);
      await page.getByRole("button", { name: next }).click();
    }
    const field = page.getByRole("textbox", { name: "Your number" });
    await expect(field).toBeVisible();
    const hint = page.locator('[data-round="encore"] [data-enter-hint]');
    await expect(hint).toHaveText("Enter locks in.");
    await expect(field).toHaveAccessibleDescription(/Enter locks in\.$/);
    // It sits in the preview's line, right under the field, and that line
    // keeps its place when the preview arrives.
    const lockIn = page.getByRole("button", { name: "Lock in", exact: true });
    const top = await topOf(lockIn);
    await field.fill("80");
    await expect(page.getByText("You're answering")).toBeVisible();
    expect(await topOf(lockIn)).toBe(top);
    const [box, line] = [
      await page.locator("[data-encore-field]").boundingBox(),
      await hint.boundingBox(),
    ];
    expect(line?.y ?? 0).toBeGreaterThanOrEqual(
      (box?.y ?? 0) + (box?.height ?? 0),
    );
    expect(line?.y ?? 0).toBeLessThan(top ?? 0);
    await field.press("Enter");
    await expect(page.locator("[data-encore-result]")).toBeVisible();
    await expect(page.locator("[data-enter-hint]")).toHaveCount(0);
    // The number line, which loads apart from the round, is there too.
    await expect(page.locator("[data-number-line]")).toBeVisible();
  });
});

test.describe("a suggestion's accessible name (R4-17)", () => {
  test.use(DESK);

  test("R4-17 a film's row is named The Broken Lighthouse, 1972, with no space before the comma", async ({
    page,
  }) => {
    await page.clock.setFixedTime(NOV_4);
    await openDaily(page);
    const field = page.getByRole("combobox", { name: "Your guess" });
    await field.click();
    await page.keyboard.type("broken");
    // The name the browser computes, as Sam's screen reader read it.
    const row = page.getByRole("option", {
      name: "The Broken Lighthouse, 1972",
      exact: true,
    });
    await expect(row).toBeVisible();
    await expect(row).toHaveAccessibleName(/\S, \d{4}$/);
    for (const option of await page.getByRole("option").all()) {
      await expect(option).not.toHaveAccessibleName(/\s,/);
    }
    // What shows is unchanged: the name, then its year at the right.
    await expect(row.locator("[data-row-name]")).toHaveText(
      "The Broken Lighthouse",
    );
    await expect(row.locator("[data-row-aside]")).toHaveText("1972");
  });
});
