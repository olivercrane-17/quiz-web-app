/**
 * The design system on the real pages (DS-1, DESIGN §2 to §11): no serious
 * accessibility findings on Today in either theme, keyboard focus that never
 * hides under a bar, the forced-colours borders that keep every answer and
 * progress state, practice's segments filled with their verdicts, the
 * explanation sheet's rise, no horizontal scroll at 320 px on the Wave 1
 * screens (200% text included), the 560 px column from 480 px, and the
 * switches the settings drive (high-contrast feedback, Reduce motion,
 * Readable text) reaching the tokens.
 *
 * axe-core runs from the copy npm already installed (4.14.0, the version
 * @axe-core/playwright pins), injected into the page, with the tags of
 * ARCHITECTURE §11.5.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { dateSlotScript } from "../../src/ui/date-slot-text";
import { expect, test } from "../fixtures";

const AXE_SOURCE = readFileSync(
  join(process.cwd(), "node_modules/axe-core/axe.min.js"),
  "utf8",
);
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Serious and critical axe findings on the page as it stands. */
async function seriousAxeFindings(page: Page) {
  await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async (tags) => {
    const axe = (
      window as unknown as {
        axe: {
          run(
            context: Document,
            options: object,
          ): Promise<{
            violations: {
              id: string;
              impact: string | null;
              nodes: { target: string[] }[];
            }[];
          }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return result.violations
      .filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      )
      .map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target.join(" ")),
      }));
  }, AXE_TAGS);
}

async function storeSettings(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((value) => {
    localStorage.setItem("qz:settings", JSON.stringify(value));
  }, settings);
}

/** Today, hydrated, with the Daily card's chips in. */
async function openToday(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-daily-card] li").first()).toBeVisible();
}

/** Quick play from Today, to its first question. */
async function startQuickPlay(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Quick play" }).first().click();
  await expect(page).toHaveURL("/practice/run");
  await expect(page.locator('main [data-state="idle"]').first()).toBeVisible();
}

/** The open question's heading: a tap on it completes the reveal at once. */
const stem = (page: Page) => page.locator('[data-round="choice"] h1');

const continueButton = (page: Page) =>
  page.getByRole("button", { name: /^(Next question|See your results)$/ });

/**
 * A practice question answered with its first option, repeated until a
 * wrong pick shows, so the reveal holds every answer state.
 */
async function revealWithAWrongPick(page: Page): Promise<void> {
  await startQuickPlay(page);
  for (let question = 1; question <= 10; question += 1) {
    await page.locator('main [data-state="idle"]').first().click();
    await expect(page.locator('[data-state="correct"]')).toHaveCount(1);
    if ((await page.locator('[data-state="your-answer"]').count()) > 0) return;
    await page
      .getByRole("button", { name: /^(Next question|Continue)/ })
      .click();
  }
  throw new Error("ten first options in a row were right");
}

/** Practice's ten segments in the play header. */
const segment = (page: Page, status: string) =>
  page.locator(
    `header .kn-progress[data-variant="bar"] .kn-step[data-status="${status}"]`,
  );

/**
 * Practice questions answered with their first option, a run at a time,
 * until one run's segments hold a right answer and a wrong one. A first
 * option is right about one time in four, so a run can end with none: then
 * the next run starts. A tap on the question opens each sheet at once.
 */
async function answerUntilRightAndWrong(page: Page): Promise<void> {
  for (let run = 1; run <= 4; run += 1) {
    await startQuickPlay(page);
    for (let question = 1; question <= 10; question += 1) {
      await page.locator('main [data-state="idle"]').first().click();
      await expect(page.locator('main [data-state="correct"]')).toHaveCount(1);
      if (
        (await segment(page, "correct").count()) > 0 &&
        (await segment(page, "wrong").count()) > 0
      ) {
        return;
      }
      await stem(page).click();
      await continueButton(page).click();
    }
  }
  throw new Error("four runs of first options never held both verdicts");
}

test.describe("accessibility", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`axe finds nothing serious on Today in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openToday(page);
      expect(await seriousAxeFindings(page)).toEqual([]);
    });
  }

  test("axe finds nothing serious on a practice reveal in the dark theme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await revealWithAWrongPick(page);
    expect(await seriousAxeFindings(page)).toEqual([]);
  });

  test("every control on Today meets the 44 px target", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openToday(page);
    // A control smaller than 44 px may still meet the target through a hit
    // area drawn around it (`.kn-hit`, DESIGN §4): taps 21 px either side
    // of its centre must still land on it.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a[href], button")]
        .filter((element) => element.checkVisibility())
        .filter((element) => {
          if (
            element.getBoundingClientRect().width >= 44 &&
            element.getBoundingClientRect().height >= 44
          ) {
            return false;
          }
          element.scrollIntoView({ block: "center" });
          const box = element.getBoundingClientRect();
          const x = box.left + box.width / 2;
          const y = box.top + box.height / 2;
          const reach = [
            [x - 21, y],
            [x + 21, y],
            [x, y - 21],
            [x, y + 21],
          ] as const;
          return !reach.every(([px, py]) =>
            element.contains(document.elementFromPoint(px, py)),
          );
        })
        .map(
          (element) =>
            element.textContent?.trim() || element.getAttribute("aria-label"),
        ),
    );
    expect(small).toEqual([]);
  });

  for (const { width, height, text } of [
    { width: 360, height: 640, text: "100%" },
    { width: 360, height: 640, text: "200%" },
    { width: 390, height: 844, text: "200%" },
  ]) {
    test(`keyboard focus on Today never lands under the tab bar or the top bar, at ${width} by ${height} with ${text} text (WCAG 2.4.11)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openToday(page);
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, text);
      const hidden: string[] = [];
      for (let step = 0; step < 80; step += 1) {
        await page.keyboard.press("Tab");
        // The centre of what has focus hit-tests to it: nothing covers it.
        const focus = await page.evaluate(() => {
          const element = document.activeElement;
          if (!(element instanceof HTMLElement) || element === document.body) {
            return { done: true, name: "", covered: false };
          }
          if (element.dataset.e2eSeen !== undefined) {
            return { done: true, name: "", covered: false };
          }
          element.dataset.e2eSeen = "";
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2,
          );
          return {
            done: false,
            name:
              element.getAttribute("aria-label") ??
              element.textContent?.trim() ??
              element.tagName,
            covered: !element.contains(hit),
          };
        });
        if (focus.done) break;
        if (focus.covered) hidden.push(focus.name);
      }
      expect(hidden).toEqual([]);
    });
  }
});

test.describe("practice's progress segments", () => {
  // A run of first options may hold no right answer; the helper plays on.
  test.describe.configure({ timeout: 120_000 });

  test("fill with their verdict: teal and a check for a right answer, the incorrect tint and a dashed edge for a wrong one", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await answerUntilRightAndWrong(page);
    const right = segment(page, "correct").first();
    await expect(right).toHaveCSS("background-color", "rgb(11, 102, 112)");
    await expect(right).toHaveCSS("border-top-color", "rgb(11, 102, 112)");
    // The cream check on teal: 7.2:1, where the empty well gave it 1.22:1.
    await expect(right.locator("svg")).toHaveCSS("color", "rgb(255, 251, 245)");
    const wrong = segment(page, "wrong").first();
    await expect(wrong).toHaveCSS("background-color", "rgb(248, 224, 225)");
    await expect(wrong).toHaveCSS("border-top-style", "dashed");
    await expect(wrong).toHaveCSS("border-top-color", "rgb(180, 42, 60)");
    // Only an unanswered segment is the empty well.
    const upcoming = segment(page, "upcoming");
    if ((await upcoming.count()) > 0) {
      await expect(upcoming.last()).toHaveCSS(
        "background-color",
        "rgb(236, 228, 214)",
      );
    }
  });

  test("keep their shapes in forced colours: a 3 px double edge for right, dashed for wrong", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await answerUntilRightAndWrong(page);
    const right = segment(page, "correct").first();
    await expect(right).toHaveCSS("border-top-style", "double");
    await expect(right).toHaveCSS("border-top-width", "3px");
    const wrong = segment(page, "wrong").first();
    await expect(wrong).toHaveCSS("border-top-style", "dashed");
    await expect(wrong).toHaveCSS("border-top-width", "2px");
  });
});

test.describe("the explanation sheet", () => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 320, height: 640 },
  ]) {
    test(`rises from below by itself after a verdict, a tap anywhere completes the rise, and Continue lands on screen, at ${viewport.width} by ${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await startQuickPlay(page);
      // Watch the sheet arrive: the states it passes through, its first
      // frame of motion, and a press while it rises.
      await page.evaluate(() => {
        const log: string[] = [];
        (window as unknown as { __arrival: string[] }).__arrival = log;
        new MutationObserver((records) => {
          for (const record of records) log.push(record.oldValue ?? "none");
          const sheet = records.at(-1)?.target;
          if (!(sheet instanceof HTMLElement)) return;
          if (sheet.dataset.arrival !== "rise") return;
          requestAnimationFrame(() => {
            const moving = sheet
              .getAnimations()
              .some((animation) => animation.playState === "running");
            log.push(
              `moving ${String(moving)} ${getComputedStyle(sheet).translate}`,
            );
            window.dispatchEvent(new Event("pointerdown"));
            const done = sheet
              .getAnimations()
              .every((animation) => animation.playState === "finished");
            log.push(
              `pressed ${String(done)} ${getComputedStyle(sheet).translate}`,
            );
          });
        }).observe(document.body, {
          subtree: true,
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ["data-arrival"],
        });
      });
      // No tap: the sheet opens by itself at 1.2 s.
      await page.locator('main [data-state="idle"]').first().click();
      await expect(page.locator('[data-sheet="inline"]')).toHaveAttribute(
        "data-arrival",
        "rise",
      );
      const log = () =>
        page.evaluate(
          () => (window as unknown as { __arrival: string[] }).__arrival,
        );
      await expect.poll(log).toHaveLength(4);
      const [first, second, moving, pressed] = await log();
      // Unseen for a frame ("pending"), then the rise.
      expect([first, second]).toEqual(["none", "pending"]);
      // Below its place (by up to its own height), on its way up, in the
      // first frame...
      expect(moving).toMatch(/^moving true 0px [1-9]\d*(\.\d+)?(px|%)$/);
      // ...and in place at once after the press.
      expect(pressed).toMatch(/^pressed true (none|0px|0px 0%)$/);
      // The round scrolled Continue into view on the sheet's final box.
      await expect(continueButton(page)).toBeInViewport({ ratio: 1 });
    });
  }

  test("is there at once when the player's own tap completes the reveal", async ({
    page,
  }) => {
    await startQuickPlay(page);
    const picked = page.locator('main [data-state="idle"]').first();
    await picked.click();
    await expect(page.locator('main [data-state="correct"]')).toHaveCount(1);
    await stem(page).click();
    const sheet = page.locator('[data-sheet="inline"]');
    await expect(sheet).toHaveAttribute("data-arrival", "instant");
    expect(await sheet.evaluate((element) => element.getAnimations())).toEqual(
      [],
    );
  });
});

test.describe("forced colours", () => {
  test("keep every answer state as a border: double for correct, dashed for a wrong pick", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await revealWithAWrongPick(page);
    const style = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const css = getComputedStyle(element);
          return { style: css.borderTopStyle, width: css.borderTopWidth };
        });
    expect(await style('[data-state="correct"]')).toEqual({
      style: "double",
      width: "4px",
    });
    expect(await style('[data-state="your-answer"]')).toEqual({
      style: "dashed",
      width: "3px",
    });
    expect(await style('[data-state="dimmed"]')).toEqual({
      style: "solid",
      width: "1px",
    });
    // The verdict glyphs stay, so no state rests on a colour.
    await expect(
      page.locator('[data-state="correct"] svg').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-state="your-answer"] svg').first(),
    ).toBeVisible();
    // The progress keeps its marks the same way.
    expect(await style('.kn-step[data-status="wrong"]')).toMatchObject({
      style: "dashed",
    });
    // The grain is off: the page is the system's own canvas.
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body, "::before").display,
      ),
    ).toBe("none");
  });

  test("keep the Daily's progress pills apart", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/daily");
    const current = page.locator('.kn-step[aria-current="step"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveCSS("outline-style", "solid");
    const upcoming = page.locator(".kn-step:not([aria-current])").first();
    await expect(upcoming).toHaveCSS("border-top-style", "solid");
    await expect(upcoming).toHaveCSS("outline-style", "none");
  });

  test("leave icon, ghost and text buttons unboxed, and drop the ticket's ledge", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await startQuickPlay(page);
    // The system colour would paint a transparent edge into a box.
    await expect(page.getByRole("link", { name: "Leave practice" })).toHaveCSS(
      "border-top-style",
      "none",
    );
    // The ticket's drop shadow would show as a band under its outline.
    const filter = await page.evaluate(() => {
      const ticket = document.createElement("div");
      ticket.className = "kn-ticket";
      document.body.append(ticket);
      const value = getComputedStyle(ticket).filter;
      ticket.remove();
      return value;
    });
    expect(filter).toBe("none");
  });
});

test.describe("layout", () => {
  test("from 480 to 767 px the tab pages are one centred column of 560 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await openToday(page);
    const column = await page.locator("main").evaluate((main) => {
      const css = getComputedStyle(main);
      const box = main.getBoundingClientRect();
      return {
        left: box.left + Number.parseFloat(css.paddingLeft),
        right: box.right - Number.parseFloat(css.paddingRight),
      };
    });
    expect(column.right - column.left).toBeCloseTo(560, 0);
    expect(column.left).toBeCloseTo(700 - column.right, 0);
    // The top bar's row sits on the same column.
    const row = await page
      .locator(".kn-topbar-row")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(row).toBeCloseTo(600, 0);
  });

  for (const width of [700, 1280]) {
    test(`a banner under the top bar runs the full width with its contents on the page's column, at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await openToday(page);
      // The markup of `Banner` (src/ui/banner.tsx) in INC-1's slot.
      const banner = await page.evaluate(() => {
        const element = document.createElement("div");
        element.className = "kn-banner";
        element.innerHTML =
          '<svg width="20" height="20" aria-hidden="true"></svg><p class="kn-banner-text"><strong>You\'re offline.</strong> Practice works.</p>';
        document.querySelector(".kn-topbar")?.append(element);
        const main = document.querySelector("main");
        if (main === null) throw new Error("main");
        const icon = element.querySelector("svg")?.getBoundingClientRect();
        return {
          band: element.getBoundingClientRect().width,
          icon: icon?.left ?? -1,
          column:
            main.getBoundingClientRect().left +
            Number.parseFloat(getComputedStyle(main).paddingLeft),
        };
      });
      expect(banner.band).toBe(width);
      expect(banner.icon).toBeCloseTo(banner.column, 0);
    });
  }

  test("a dialog rises while its scrim fades in, and under Reduce motion both fade", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openToday(page);
    // The CSS of `Dialog` (src/ui/sheet.tsx), on a native dialog opened as
    // it opens one.
    const open = () =>
      page.evaluate(async () => {
        const dialog = document.createElement("dialog");
        dialog.className = "kn-dialog";
        dialog.textContent = "What's wrong?";
        document.body.append(dialog);
        dialog.showModal();
        const look = () => ({
          opacity: getComputedStyle(dialog).opacity,
          translate: getComputedStyle(dialog).translate,
          scrim: getComputedStyle(dialog, "::backdrop").backgroundColor,
        });
        const first = look();
        await new Promise((resolve) => setTimeout(resolve, 600));
        const last = look();
        dialog.close();
        dialog.remove();
        return { first, last };
      });

    const moving = await open();
    expect(moving.first.opacity).toBe("0");
    expect(moving.first.translate).not.toBe("none");
    expect(moving.first.scrim).toBe("rgba(0, 0, 0, 0)");
    expect(moving.last).toEqual({
      opacity: "1",
      translate: "none",
      scrim: "rgba(29, 26, 22, 0.45)",
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    const still = await open();
    expect(still.first.opacity).toBe("0");
    expect(still.first.translate).toMatch(/^(none|0px|0px 0%)$/);
    expect(still.first.scrim).toBe("rgba(0, 0, 0, 0)");
    expect(still.last.opacity).toBe("1");
  });
});

test.describe("reflow at 320 px", () => {
  test.use({
    viewport: { width: 320, height: 640 },
    timezoneId: "Europe/London",
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
  });

  async function expectNoHorizontalScroll(page: Page, where: string) {
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll, `${where} scrolls sideways`).toBeLessThanOrEqual(
      overflow.client,
    );
  }

  test("Today, a practice question and its reveal never scroll sideways", async ({
    page,
  }) => {
    await openToday(page);
    await expectNoHorizontalScroll(page, "Today");
    await page.getByRole("link", { name: "Quick play" }).first().click();
    await expect(
      page.locator('main [data-state="idle"]').first(),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "a practice question");
    await page.locator('main [data-state="idle"]').first().click();
    await expect(page.locator('[data-state="correct"]')).toHaveCount(1);
    await expectNoHorizontalScroll(page, "a practice reveal");
  });

  for (const width of [320, 390]) {
    test(`at 200% text a reveal's tag goes under the answer's name, which keeps the line beside its badge, and nothing scrolls sideways, at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 640 });
      await openToday(page);
      // The run is reached by client-side navigation, so the style holds.
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await page.getByRole("link", { name: "Quick play" }).first().click();
      const idle = page.locator('main [data-state="idle"]');
      await expect(idle.first()).toBeVisible();
      await idle.first().click();
      const correct = page.locator('main [data-state="correct"]');
      await expect(correct).toHaveCount(1);
      await expectNoHorizontalScroll(page, "a practice reveal at 200% text");
      for (const option of [
        correct,
        page.locator('main [data-state="your-answer"]'),
      ]) {
        if ((await option.count()) === 0) continue;
        const fit = await option.evaluate((button) => {
          const text = button.querySelector(".kn-answer-text");
          const tag = button.querySelector(".kn-answer-tag");
          const badge = button.querySelector(".kn-answer-badge");
          if (text === null || tag === null || badge === null) {
            throw new Error("option parts");
          }
          const css = getComputedStyle(button);
          const inner =
            button.getBoundingClientRect().width -
            Number.parseFloat(css.paddingLeft) -
            Number.parseFloat(css.paddingRight) -
            Number.parseFloat(css.borderLeftWidth) -
            Number.parseFloat(css.borderRightWidth);
          const probe = document.createElement("span");
          probe.style.cssText = "display:inline-block;width:10ch";
          text.append(probe);
          const tenCh = probe.getBoundingClientRect().width;
          probe.remove();
          const box = text.getBoundingClientRect();
          return {
            width: box.width,
            // All the room beside the badge, which the tag never squeezes.
            room:
              inner -
              badge.getBoundingClientRect().width -
              Number.parseFloat(css.columnGap),
            tenCh,
            besideBadge:
              box.top < badge.getBoundingClientRect().bottom &&
              box.bottom > badge.getBoundingClientRect().top,
            tagBelow: tag.getBoundingClientRect().top >= box.bottom - 1,
            inside:
              tag.getBoundingClientRect().right <=
              button.getBoundingClientRect().right,
          };
        });
        expect(fit.width).toBeGreaterThanOrEqual(fit.room - 1);
        expect(fit.besideBadge).toBe(true);
        expect(fit.tagBelow).toBe(true);
        expect(fit.inside).toBe(true);
        // From 390 px that is at least ten characters of 36 px text.
        if (width >= 390) expect(fit.width).toBeGreaterThanOrEqual(fit.tenCh);
      }
    });
  }

  test("at 200% text the tab labels shrink to fit their tabs and never break mid-word", async ({
    page,
  }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await openToday(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const labels = await page
        .locator(".kn-tabbar .kn-tab")
        .evaluateAll((tabs) =>
          tabs.map((tab) => {
            const label = tab.lastChild;
            if (label === null) throw new Error("tab label");
            const range = document.createRange();
            range.selectNodeContents(label);
            const lines = new Set(
              [...range.getClientRects()].map((rect) => Math.round(rect.top)),
            ).size;
            const box = range.getBoundingClientRect();
            const tabBox = tab.getBoundingClientRect();
            return {
              label: label.textContent,
              lines,
              inside: box.left >= tabBox.left && box.right <= tabBox.right,
              size: Number.parseFloat(getComputedStyle(tab).fontSize),
            };
          }),
        );
      for (const label of labels) {
        expect(label, `${label.label} at ${width} px`).toMatchObject({
          lines: 1,
          inside: true,
        });
        // Bigger than at 100% text, as far as the tab allows.
        expect(label.size).toBeGreaterThan(12);
      }
    }
  });

  test("a Mystery and its last clue's options never scroll sideways", async ({
    page,
  }) => {
    await page.goto("/daily");
    await expect(
      page.getByRole("button", { name: /^Next clue/ }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "a Mystery");
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    await expect(page.locator('[data-state="idle"]').first()).toBeVisible();
    await expectNoHorizontalScroll(page, "the last clue's options");
  });

  test("the stop screen never scrolls sideways", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __QZ_MOCK_INIT__: unknown }).__QZ_MOCK_INIT__ = {
        scenario: "finished_today",
      };
    });
    await page.goto("/daily/42/results");
    await expect(page.locator("[data-score]")).toBeVisible();
    await expectNoHorizontalScroll(page, "the stop screen");
  });
});

test.describe("the settings' switches reach the tokens", () => {
  test("AC-SET-04 (token half) high-contrast feedback paints correct blue and a wrong pick orange", async ({
    page,
  }) => {
    await storeSettings(page, { v: 1, highContrast: true });
    await page.emulateMedia({ colorScheme: "light" });
    await revealWithAWrongPick(page);
    await expect(page.locator('[data-state="correct"]')).toHaveCSS(
      "background-color",
      "rgb(30, 91, 168)",
    );
    await expect(page.locator('[data-state="your-answer"]')).toHaveCSS(
      "border-top-color",
      "rgb(176, 74, 12)",
    );
  });

  test("without high contrast, correct is teal and a wrong pick cranberry", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await revealWithAWrongPick(page);
    await expect(page.locator('[data-state="correct"]')).toHaveCSS(
      "background-color",
      "rgb(11, 102, 112)",
    );
    await expect(page.locator('[data-state="your-answer"]')).toHaveCSS(
      "border-top-color",
      "rgb(180, 42, 60)",
    );
  });

  test("Reduce motion turns movement off either way round", async ({
    page,
  }) => {
    const distance = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--kn-motion-distance")
          .trim(),
      );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openToday(page);
    await page.evaluate(() => {
      localStorage.setItem(
        "qz:settings",
        JSON.stringify({ v: 1, motion: "on" }),
      );
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    expect(await distance()).toBe("0");
    await expect(
      page.getByRole("link", { name: "Quick play" }).first(),
    ).toHaveCSS("transition-duration", /0\.14s/);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      localStorage.setItem(
        "qz:settings",
        JSON.stringify({ v: 1, motion: "off" }),
      );
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
    expect(await distance()).toBe("1");
  });

  test("Readable text loosens the reading text to 0.05 em and a 1.6 line height, answer options and the tab bar included", async ({
    page,
  }) => {
    await storeSettings(page, { v: 1, readableText: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await openToday(page);
    const body = await page.evaluate(() => {
      const css = getComputedStyle(document.body);
      return {
        size: Number.parseFloat(css.fontSize),
        tracking: Number.parseFloat(css.letterSpacing),
        leading: Number.parseFloat(css.lineHeight),
      };
    });
    expect(body.tracking).toBeCloseTo(body.size * 0.05, 1);
    expect(body.leading).toBeCloseTo(body.size * 1.6, 1);
    // Text set with Tailwind's sizes follows too.
    const line = await page
      .locator('[data-home-slot="practice"]')
      .getByText("Ten questions on anything. Works offline.")
      .evaluate((element) => {
        const css = getComputedStyle(element);
        return (
          Number.parseFloat(css.lineHeight) / Number.parseFloat(css.fontSize)
        );
      });
    expect(line).toBeCloseTo(1.6, 2);

    /** Line height and tracking, each over the font size. */
    const spacing = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const css = getComputedStyle(element);
          const size = Number.parseFloat(css.fontSize);
          return {
            leading: Number.parseFloat(css.lineHeight) / size,
            tracking: Number.parseFloat(css.letterSpacing) / size,
          };
        });
    // Primitives with their own compact line heights follow too.
    const tab = await spacing(".kn-tabbar .kn-tab");
    expect(tab.leading).toBeCloseTo(1.6, 2);
    expect(tab.tracking).toBeCloseTo(0.05, 2);
    await page.getByRole("link", { name: "Quick play" }).first().click();
    await expect(
      page.locator('main [data-state="idle"]').first(),
    ).toBeVisible();
    const option = await spacing('main [data-state="idle"] .kn-answer-text');
    expect(option.leading).toBeCloseTo(1.6, 2);
    expect(option.tracking).toBeCloseTo(0.05, 2);
  });
});

test.describe("the date slot", () => {
  test("is filled while the page parses, before anything paints", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    const script = dateSlotScript({
      id: "qz-daily-slot",
      epoch: "2026-09-21",
      template: "Daily #{n} · {weekday} {day} {month}",
      weekdays: [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      months: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
    });
    // What the parser sees: the slot, then its script, then more page.
    await page.setContent(
      `<p><span id="qz-daily-slot" data-pending>Daily #00 · Wednesday 30 September</span><script>${script}</script></p>` +
        `<script>window.__seen = document.getElementById("qz-daily-slot").textContent</script>`,
    );
    expect(
      await page.evaluate(() => (window as { __seen?: string }).__seen),
    ).toBe("Daily #42 · Sunday 1 November");
    await expect(page.locator("#qz-daily-slot")).not.toHaveAttribute(
      "data-pending",
    );
  });
});
