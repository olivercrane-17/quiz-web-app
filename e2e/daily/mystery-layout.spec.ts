/**
 * The Mystery's and the Encore's layout in a real browser (FIX-MYS, RITE
 * round 1, docs/playtests/rite-1.md §5): what the component tests can only
 * check through class names and mocked boxes. Each test measures the
 * production build on the mock backend: large text (`html { font-size: 200%
 * }`, as the phone setting does), short windows, and an on-screen keyboard
 * stood in for by cutting the viewport's height while the field has focus,
 * which is how AC-DLY-32 describes it.
 *
 * Daily #45 (4 November 2026) plays the fixture film (with its four
 * "…Lighthouse" decoys), cobalt and Arvenna, then Lake Ostry (86.4 m).
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { expectNoSeriousAxe } from "../support/axe";
import { mockInit } from "../support/mock";

/** 09:00 in London on Wednesday 4 November 2026: Daily #45. */
const NOV_4 = new Date("2026-11-04T09:00:00Z");
/** The next day: Daily #46, whose Mystery 1 is a person. */
const NOV_5 = new Date("2026-11-05T09:00:00Z");

/** The phone's text size at 200% (PRD §3.12.4, release criterion R2). */
const LARGE_TEXT = "html { font-size: 200% !important; }";

test.use({ timezoneId: "Europe/London" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOV_4);
});

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
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
    height: box.height,
  };
}

/** The bottom of the sticky play header: nothing under it can be read. */
async function headerBottom(page: Page): Promise<number> {
  return (await boxOf(page.locator("header").first())).bottom;
}

/** Opens today's Daily at `size`, with large text if asked, on Mystery 1's clue 1. */
async function openDaily(
  page: Page,
  size: { width: number; height: number },
  largeText = false,
): Promise<Locator> {
  await page.setViewportSize(size);
  await page.goto("/daily");
  const field = page.getByRole("combobox", { name: "Your guess" });
  await expect(field).toBeVisible();
  if (largeText) await page.addStyleTag({ content: LARGE_TEXT });
  return field;
}

/**
 * Waits until the round's entrance transitions end (the new clue unfolds
 * over 580 ms), so boxes are measured where they come to rest, as a player
 * who reads the clue before typing would see them.
 */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    (
      document
        .querySelector("[data-round]")
        ?.getAnimations({ subtree: true }) ?? []
    ).every((animation) => animation.playState !== "running"),
  );
}

/** Presses Next clue until the round shows `clue`, and lets the new clue settle. */
async function toClue(page: Page, clue: number) {
  const round = page.locator('[data-round="mystery"]');
  for (let shown = 1; shown < clue; shown += 1) {
    await page.getByRole("button", { name: /^(Next|Last) clue/ }).click();
    await expect(round).toHaveAttribute("data-clue", String(shown + 1));
  }
  await settle(page);
}

/** Plays Daily #45's three Mysteries out on Next clue and option A, to the Encore. */
async function toTheEncore(page: Page) {
  for (const next of ["Next mystery", "Next mystery", "On to the Encore"]) {
    await toClue(page, 4);
    await page.getByRole("button", { name: /^A\. / }).click();
    await page.getByRole("button", { name: next }).click();
  }
  await expect(page.locator('[data-round="encore"]')).toBeVisible();
}

/** The words in `selector`'s elements that a line break cuts in two. */
function brokenWords(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((query) => {
    const broken: string[] = [];
    for (const element of document.querySelectorAll(query)) {
      // The text, across the <mark> that bolds the typed letters.
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes: { node: Text; start: number }[] = [];
      let text = "";
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push({ node: node as Text, start: text.length });
        text += node.nodeValue ?? "";
      }
      const at = (offset: number) => {
        const found = [...nodes].reverse().find((n) => n.start <= offset);
        if (found === undefined) throw new Error("no text");
        return { node: found.node, offset: offset - found.start };
      };
      for (const match of text.matchAll(/\S+/g)) {
        const start = at(match.index);
        const end = at(match.index + match[0].length - 1);
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset + 1);
        const lines = new Set(
          [...range.getClientRects()].map((rect) => Math.round(rect.top)),
        );
        if (lines.size > 1) broken.push(match[0]);
      }
    }
    return broken;
  }, selector);
}

test.describe("the guess field at 200% text (R1-03)", () => {
  test("R1-03 at 390 by 844 with 200% text the guess field and rows fit, and the typing stays in sight", async ({
    page,
  }) => {
    // Sam: the text area shrank to 28 px for 38 px text, and the rows
    // truncated to "The L… 1987".
    const field = await openDaily(page, { width: 390, height: 844 }, true);
    await field.pressSequentially("lan");
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    expect(
      await field.evaluate((input) => input.clientWidth),
    ).toBeGreaterThanOrEqual(160);
    // No name is cut, and no word in one is broken across lines.
    const names = page.locator("[data-row-name]");
    expect(await names.count()).toBeGreaterThan(1);
    for (const overflow of await names.evaluateAll((all) =>
      all.map((name) => name.scrollWidth - name.clientWidth),
    )) {
      expect(overflow).toBeLessThanOrEqual(0);
    }
    expect(await brokenWords(page, "[data-row-name]")).toEqual([]);
    // Guess takes a full-width row under the field; Clear is gone.
    const frame = await boxOf(page.locator("[data-field-frame]"));
    const guess = await boxOf(page.locator("[data-guess]"));
    expect(guess.top).toBeGreaterThanOrEqual(frame.bottom);
    expect(guess.right - guess.left).toBeGreaterThanOrEqual(
      frame.right - frame.left - 1,
    );
    await expect(
      page.getByRole("button", { name: "Clear your guess" }),
    ).toBeHidden();
    // The field sits below the header, and nothing in the round runs off the screen.
    expect((await boxOf(field)).top).toBeGreaterThanOrEqual(
      await headerBottom(page),
    );
    const widest = await page
      .locator('[data-round="mystery"] *')
      .evaluateAll((all) =>
        Math.max(
          ...all.map((element) => element.getBoundingClientRect().right),
        ),
      );
    expect(widest).toBeLessThanOrEqual(390);
  });

  test("R1-03 D14 at 200% text a narrow field's placeholder keeps its noun, wrapping if it must", async ({
    page,
  }) => {
    // "Start typing a fi…": the one-line placeholder lost the noun D14 is for.
    for (const { date, width, height, placeholder } of [
      {
        date: NOV_4,
        width: 390,
        height: 844,
        placeholder: "Start typing a film",
      },
      {
        date: NOV_5,
        width: 320,
        height: 568,
        placeholder: "Start typing a person",
      },
    ]) {
      await page.clock.setFixedTime(date);
      const field = await openDaily(page, { width, height }, true);
      await expect(field).toHaveAttribute("placeholder", placeholder);
      // The input's own placeholder, which assistive tech reads, is clear;
      // the one drawn over the field shows it whole.
      expect(
        await field.evaluate(
          (input) => getComputedStyle(input, "::placeholder").color,
        ),
      ).toBe("rgba(0, 0, 0, 0)");
      const drawn = page.locator("[data-placeholder]");
      await expect(drawn).toBeVisible();
      await expect(drawn).toHaveText(placeholder);
      const fit = await drawn.evaluate((element) => ({
        across: element.scrollWidth - element.clientWidth,
        down: element.scrollHeight - element.clientHeight,
      }));
      expect(fit).toEqual({ across: 0, down: 0 });
      expect(await brokenWords(page, "[data-placeholder]")).toEqual([]);
      const frame = await boxOf(page.locator("[data-field-frame]"));
      const text = await boxOf(drawn);
      expect(text.bottom).toBeLessThanOrEqual(frame.bottom);
      expect(text.right).toBeLessThanOrEqual(frame.right);
    }
  });

  test("R1-03 at 390 by 844 with 200% text and the keyboard up, typing never scrolls the field under the header", async ({
    page,
  }) => {
    // With the keyboard up (the viewport cut to 553 px), the field and three
    // tall rows couldn't all fit, and the field ended above the header.
    const field = await openDaily(page, { width: 390, height: 844 }, true);
    await field.click();
    await page.setViewportSize({ width: 390, height: 553 });
    await expect(page.locator('[data-round="mystery"]')).toHaveAttribute(
      "data-keyboard",
      "open",
    );
    await field.pressSequentially("lan");
    const first = page.getByRole("option").first();
    await expect(first).toBeVisible();
    await expect
      .poll(async () => (await boxOf(field)).top)
      .toBeGreaterThanOrEqual(await headerBottom(page));
    // The first row is whole above the keyboard.
    expect((await boxOf(first)).bottom).toBeLessThanOrEqual(553);
  });

  test("R1-03 at 360 by 640 with 200% text and no keyboard, the list opens under the field without lifting it under the header", async ({
    page,
  }) => {
    const field = await openDaily(page, { width: 360, height: 640 }, true);
    await field.pressSequentially("light");
    const first = page.getByRole("option").first();
    await expect(first).toBeVisible();
    await expect(page.locator('[data-round="mystery"]')).not.toHaveAttribute(
      "data-keyboard",
      "open",
    );
    await expect
      .poll(async () => (await boxOf(field)).top)
      .toBeGreaterThanOrEqual(await headerBottom(page));
    expect((await boxOf(first)).bottom).toBeLessThanOrEqual(640);
    // "Lighthouse" whole on its line, and nothing scrolls sideways.
    expect(await brokenWords(page, "[data-row-name]")).toEqual([]);
    const list = page.getByRole("listbox");
    expect(
      await list.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  test("at 320 by 568 with 200% text a typo row's mark wraps inside the list, which never scrolls sideways", async ({
    page,
  }) => {
    const field = await openDaily(page, { width: 320, height: 568 }, true);
    // "light" finds Halvessa Nights by a typo (R1-37).
    await field.pressSequentially("light");
    await expect(page.locator("[data-typo-mark]").first()).toBeAttached();
    const list = page.getByRole("listbox");
    expect(
      await list.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    const listBox = await boxOf(list);
    for (const mark of await page.locator("[data-typo-mark]").all()) {
      expect((await boxOf(mark)).right).toBeLessThanOrEqual(listBox.right);
    }
  });

  test.describe("on a phone", () => {
    test.use({
      viewport: { width: 320, height: 568 },
      isMobile: true,
      hasTouch: true,
    });

    test("a page that overflows sideways is never read as an open keyboard", async ({
      page,
    }) => {
      // At 320 by 568 with 200% text, a page wider than the screen made the
      // phone's layout viewport 742 px tall: "a keyboard", with none there.
      await page.goto("/daily");
      const field = page.getByRole("combobox", { name: "Your guess" });
      await expect(field).toBeVisible();
      await page.addStyleTag({
        // Whatever else is too wide, this page is: 418 px.
        content: `${LARGE_TEXT} body::after { content: ""; display: block; width: 418px; height: 1px; }`,
      });
      await field.tap();
      await field.pressSequentially("lan");
      await expect(page.getByRole("option").first()).toBeVisible();
      // The phone widened its layout viewport for the page, as it does.
      expect(await page.evaluate(() => window.innerWidth)).toBeGreaterThan(320);
      await expect(page.locator('[data-round="mystery"]')).not.toHaveAttribute(
        "data-keyboard",
        "open",
      );
      expect((await boxOf(field)).top).toBeGreaterThanOrEqual(
        await headerBottom(page),
      );
    });
  });
});

test.describe("the list in view (R1-11, AC-DLY-32)", () => {
  test("R1-11 at 640 by 400 the list opens in view without a keyboard", async ({
    page,
  }) => {
    // Sam at 200% zoom on 1280 by 800: the list opened below the fold, and
    // only "47 films match" said it was there.
    await openDaily(page, { width: 640, height: 400 });
    await toClue(page, 3);
    // Focus is on clue 3's heading; the first Tab reaches the field (D15).
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("combobox", { name: "Your guess" }),
    ).toBeFocused();
    await page.keyboard.type("the");
    const options = page.getByRole("option");
    await expect(options.nth(2)).toBeAttached();
    await expect(page.locator('[data-round="mystery"]')).not.toHaveAttribute(
      "data-keyboard",
      "open",
    );
    // With no scrolling by the test: the page brought them in.
    await expect
      .poll(
        async () => (await boxOf(page.locator("[data-field-frame]"))).bottom,
      )
      .toBeLessThanOrEqual(400);
    for (let index = 0; index < 3; index += 1) {
      expect((await boxOf(options.nth(index))).bottom).toBeLessThanOrEqual(400);
    }
    expect(
      (await boxOf(page.locator("[data-clue-card]"))).top,
    ).toBeGreaterThanOrEqual(await headerBottom(page));
  });

  test("AC-DLY-32 at 360 by 640 with the keyboard up, clue 2, the field, three whole rows and Next clue all show", async ({
    page,
  }) => {
    const field = await openDaily(page, { width: 360, height: 640 });
    await toClue(page, 2);
    await field.click();
    // A 300 px keyboard: the visual viewport cut to 340 px.
    await page.setViewportSize({ width: 360, height: 340 });
    const round = page.locator('[data-round="mystery"]');
    await expect(round).toHaveAttribute("data-keyboard", "open");
    await field.pressSequentially("the");
    const options = page.getByRole("option");
    await expect(options.nth(2)).toBeAttached();
    const top = await headerBottom(page);
    await expect
      .poll(async () => (await boxOf(options.nth(2))).bottom)
      .toBeLessThanOrEqual(340);
    // Three whole one-line rows, the list as wide as the field's row.
    for (let index = 0; index < 3; index += 1) {
      const row = await boxOf(options.nth(index));
      expect(row.height).toBeLessThanOrEqual(49);
      expect(row.top).toBeGreaterThanOrEqual(top);
    }
    const nextClue = await boxOf(
      page.locator("[data-combobox] [data-next-clue][data-compact]"),
    );
    const list = await boxOf(page.getByRole("listbox"));
    expect(list.right).toBeGreaterThanOrEqual(nextClue.right - 1);
    // The newest clue whole, below the header; the field and Next clue too.
    const clue = await boxOf(page.locator("[data-clue-card]"));
    const heading = await boxOf(page.locator("[data-clue-card] h2"));
    expect(clue.top).toBeGreaterThanOrEqual(top);
    expect(heading.top).toBeGreaterThanOrEqual(top);
    expect(heading.bottom).toBeLessThanOrEqual(340);
    const fieldBox = await boxOf(field);
    expect(fieldBox.top).toBeGreaterThanOrEqual(top);
    expect(fieldBox.bottom).toBeLessThanOrEqual(340);
    expect(nextClue.top).toBeGreaterThanOrEqual(top);
    expect(nextClue.bottom).toBeLessThanOrEqual(340);
    // Clue 1 collapses to one line.
    const past = page.locator('[data-rung="past"] p').first();
    const lineHeight = await past.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).lineHeight),
    );
    expect(
      await past.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThan(2 * lineHeight);
  });

  test("AC-DLY-29 R1-33 with the keyboard up on clue 3, Next clue shows its whole name in the field's height", async ({
    page,
  }) => {
    // The compact button showed "Last clue" alone, its name's middle unseen.
    const field = await openDaily(page, { width: 360, height: 640 });
    await toClue(page, 3);
    await field.click();
    await page.setViewportSize({ width: 360, height: 340 });
    await expect(page.locator('[data-round="mystery"]')).toHaveAttribute(
      "data-keyboard",
      "open",
    );
    await field.pressSequentially("the");
    const button = page.locator(
      "[data-combobox] [data-next-clue][data-compact]",
    );
    await expect(button).toHaveAccessibleName(
      "Last clue and options · then worth 1",
    );
    await expect(button).toHaveText(
      /^Last clue\s*and options\s*·?\s*then worth 1$/,
    );
    const frame = await boxOf(page.locator("[data-field-frame]"));
    expect((await boxOf(button)).height).toBeLessThanOrEqual(frame.height + 1);
    const options = page.getByRole("option");
    await expect
      .poll(async () => (await boxOf(options.nth(2))).bottom)
      .toBeLessThanOrEqual(340);
  });
});

test.describe("Next clue with text in the field (D9, D15, D17)", () => {
  test("a click on Next clue lands the first time, whether the list or 'No matches' is open", async ({
    page,
  }) => {
    // The press blurred the field, the list or the "No matches" line closed,
    // and Next clue jumped up from under the pointer before the release.
    const field = await openDaily(page, { width: 1280, height: 800 });
    const round = page.locator('[data-round="mystery"]');
    const nextClue = page.getByRole("button", { name: /^(Next|Last) clue/ });

    await field.pressSequentially("zzzz");
    await expect(
      page.getByText("No matches. Try another spelling, or use Next clue."),
    ).toBeVisible();
    await nextClue.click();
    await expect(round).toHaveAttribute("data-clue", "2");
    // D9: the typing waits in the field.
    await expect(field).toHaveValue("zzzz");

    await field.fill("the");
    await expect(page.getByRole("listbox")).toBeVisible();
    await nextClue.click();
    await expect(round).toHaveAttribute("data-clue", "3");
    await expect(page.getByRole("heading", { level: 2 })).toBeFocused();
  });
});

test.describe("rows on a tint (WCAG 1.4.3)", () => {
  test("a highlighted row passes axe's colour contrast at 390 by 844", async ({
    page,
  }) => {
    const field = await openDaily(page, { width: 390, height: 844 });
    await field.pressSequentially("the");
    // The rows come once the answer list has loaded.
    const first = page.getByRole("option").first();
    await expect(first).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expectNoSeriousAxe(page);
  });

  test("a hovered row passes axe's colour contrast at 640 by 400", async ({
    page,
  }) => {
    const field = await openDaily(page, { width: 640, height: 400 });
    await field.pressSequentially("the");
    await page.getByRole("option").first().hover();
    await expectNoSeriousAxe(page);
  });
});

test.describe("the reveal under the sticky header (R1-12)", () => {
  /** Picks `answer` among clue 4's options and waits for the reveal to settle. */
  async function pickOnClue4(page: Page, answer: string) {
    await toClue(page, 4);
    await page
      .getByRole("button", { name: new RegExp(`^[A-D]\\. ${answer}`) })
      .click();
    await expect(page.locator("[data-reveal]")).toBeVisible();
    // The stamp lands at 680 ms; measure where it comes to rest.
    await page.waitForFunction(() =>
      (
        document
          .querySelector("[data-reveal]")
          ?.getAnimations({ subtree: true }) ?? []
      ).every((animation) => animation.playState !== "running"),
    );
  }

  /** The stamp and the round's kicker below the header, the focused heading whole on screen. */
  async function expectRevealInView(
    page: Page,
    answer: string,
    height: number,
  ) {
    const top = await headerBottom(page);
    const heading = page.getByRole("heading", { level: 1, name: answer });
    await expect(heading).toBeFocused();
    const verdict = await boxOf(page.locator("[data-verdict]"));
    expect(verdict.top, `${answer}'s stamp`).toBeGreaterThanOrEqual(top);
    const kicker = await boxOf(page.locator("[data-reveal] > p").first());
    expect(kicker.top, `${answer}'s kicker`).toBeGreaterThanOrEqual(top);
    const box = await boxOf(heading);
    expect(box.top, `${answer}'s heading`).toBeGreaterThanOrEqual(top);
    expect(box.bottom, `${answer}'s heading`).toBeLessThanOrEqual(height);
  }

  test.describe("at 200% zoom on 1280 by 800", () => {
    test.use({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });

    test("R1-12 after a clue-4 pick the stamp and the focused heading sit below the header, on Mystery 1 and Mystery 2", async ({
      page,
    }) => {
      // Sam: "Cobalt" at y 0 to 30 and "Got it." at y -49, both under the
      // 57 px header.
      await page.goto("/daily");
      await expect(
        page.getByRole("combobox", { name: "Your guess" }),
      ).toBeVisible();
      await pickOnClue4(page, "The Lantern Keeper");
      await expectRevealInView(page, "The Lantern Keeper (1987)", 400);
      await page.getByRole("button", { name: "Next mystery" }).click();
      await expect(
        page.getByRole("combobox", { name: "Your guess" }),
      ).toBeVisible();
      await pickOnClue4(page, "Cobalt");
      await expectRevealInView(page, "Cobalt", 400);
    });
  });

  test("R1-12 at 360 by 640 the kicker and the stamp show after a clue-4 pick, the page no longer kept at the options", async ({
    page,
  }) => {
    // The page kept its 96 px scroll: the kicker hidden and the stamp cut.
    await openDaily(page, { width: 360, height: 640 });
    await pickOnClue4(page, "The Lantern Keeper");
    await expectRevealInView(page, "The Lantern Keeper (1987)", 640);
  });
});

test.describe("the clue ladder at 200% text (R1-03)", () => {
  for (const { width, height } of [
    { width: 360, height: 640 },
    { width: 320, height: 568 },
  ]) {
    test(`R1-03 at ${String(width)} by ${String(height)} with 200% text no clue card runs off the screen, a long word in clue 4 breaks inside its card, and the options keep to the screen`, async ({
      page,
    }) => {
      // "lighthouse's" ran past the card, and the options ran to x 363.
      await openDaily(page, { width, height }, true);
      for (let clue = 1; clue <= 4; clue += 1) {
        if (clue > 1) {
          await page.getByRole("button", { name: /^(Next|Last) clue/ }).click();
          await expect(page.locator('[data-round="mystery"]')).toHaveAttribute(
            "data-clue",
            String(clue),
          );
        }
        await settle(page);
        for (const card of await page.locator("[data-clue-card]").all()) {
          const box = await boxOf(card);
          expect(box.left, `clue ${clue}`).toBeGreaterThanOrEqual(0);
          expect(box.right, `clue ${clue}`).toBeLessThanOrEqual(width);
          expect(
            await card.evaluate(
              (element) => element.scrollWidth - element.clientWidth,
            ),
            `clue ${clue}`,
          ).toBeLessThanOrEqual(0);
        }
      }
      const heading = page.locator("[data-clue-card] h2");
      await expect(heading).toContainText("lighthouse");
      expect(
        await heading.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
      for (const option of await page.locator("[data-options] button").all()) {
        expect((await boxOf(option)).right).toBeLessThanOrEqual(width);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    });
  }
});

test.describe("the Encore at 200% text", () => {
  test("R1-03 at 360 by 640 with 200% text the Encore's field shows the whole typed number, its unit under it", async ({
    page,
  }) => {
    // "86.4" showed as "4 in metres", while the preview read 86.4 m.
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/daily");
    await toTheEncore(page);
    await page.addStyleTag({ content: LARGE_TEXT });
    const input = page.getByRole("textbox", { name: "Your number" });
    await input.pressSequentially("86.4");
    await expect(page.getByText("You're answering")).toBeVisible();
    const fit = await input.evaluate((element) => ({
      shown: element.clientWidth,
      needed: element.scrollWidth,
    }));
    expect(fit.shown).toBeGreaterThanOrEqual(fit.needed);
    const unit = await boxOf(page.locator("[data-encore-unit]"));
    expect(unit.top).toBeGreaterThanOrEqual((await boxOf(input)).bottom - 1);
  });

  // "1,250,000" showed as "250,000" in a 258 px field, and "1,234.5" as
  // ",234.5" at 360 px.
  for (const { width, height, value } of [
    { width: 390, height: 844, value: "1,250,000" },
    { width: 360, height: 640, value: "1,234.5" },
    { width: 360, height: 640, value: "12,345" },
  ]) {
    test(`R1-03 at ${String(width)} by ${String(height)} with 200% text "${value}" shrinks to fit the field, leading digits and all, while "86.4" keeps the full size`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/daily");
      await toTheEncore(page);
      await page.addStyleTag({ content: LARGE_TEXT });
      const input = page.getByRole("textbox", { name: "Your number" });
      const fontSize = async () =>
        Number.parseFloat(
          await input.evaluate((element) => getComputedStyle(element).fontSize),
        );
      await input.pressSequentially("86.4");
      expect(await fontSize()).toBe(88);
      await input.fill("");
      await input.pressSequentially(value);
      await expect(page.getByText("You're answering")).toBeVisible();
      const fit = await input.evaluate((element) => ({
        shown: element.clientWidth,
        needed: element.scrollWidth,
      }));
      expect(fit.needed).toBeLessThanOrEqual(fit.shown);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      // Every digit shows, still well above body text.
      expect(await fontSize()).toBeGreaterThanOrEqual(32);
    });
  }

  test("at 320 by 568 with 200% text the number line keeps every label whole and inside the card", async ({
    page,
  }) => {
    // The ends' values stood one character to a line, and an off-scale
    // guess's label began outside the card.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/daily");
    await toTheEncore(page);
    await page.addStyleTag({ content: LARGE_TEXT });
    await page.getByRole("textbox", { name: "Your number" }).fill("9999999");
    await page.getByRole("button", { name: "Lock in" }).click();
    const line = page.locator("[data-number-line]");
    await expect(line).toBeVisible();
    const figure = await boxOf(line);
    for (const name of ["guess", "low", "answer", "high"]) {
      const label = await boxOf(page.locator(`[data-label="${name}"]`));
      expect(label.left).toBeGreaterThanOrEqual(figure.left);
      expect(label.right).toBeLessThanOrEqual(figure.right);
    }
    await expect(page.locator('[data-label="guess"]')).toHaveText(
      "You 9,999,999 m →",
    );
    expect(await brokenWords(page, "[data-number-line] [data-label]")).toEqual(
      [],
    );
  });
});

test.describe("the first-Daily hint (R1-04)", () => {
  // The flag's whole path: the mock's start says whether the player has
  // finished a Daily, the Daily's controller keeps it, its round area puts
  // it in the round context (FIX-DLY), and the Mystery draws the hint.

  const HINT =
    "Get it from this clue for 4 points. A wrong guess costs the same as Next clue, so have a go.";

  test("R1-04 a fresh identity sees the hint under Mystery 1's clue 1, and the field reads it", async ({
    page,
  }) => {
    const field = await openDaily(page, { width: 390, height: 844 });
    const hint = page.getByText(HINT);
    await expect(hint).toBeVisible();
    await expect(field).toHaveAccessibleDescription(
      new RegExp(HINT.replaceAll(".", "\\.")),
    );
    await toClue(page, 2);
    await expect(hint).toHaveCount(0);
  });

  test("R1-04 the next date's Daily, once one is finished, shows no hint", async ({
    page,
  }) => {
    await mockInit(page, { scenario: "finished_today" });
    await page.goto("/");
    await expect(page.locator('[data-daily-card="finished"]')).toBeVisible();
    await page.clock.setFixedTime(NOV_5);
    await openDaily(page, { width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await expect(page.getByText(HINT)).toHaveCount(0);
  });
});
