/**
 * The design system on the real pages (DS-1, DESIGN §2 to §11): no serious
 * accessibility findings on Today in either theme, the forced-colours
 * borders that keep every answer state, no horizontal scroll at 320 px on
 * the Wave 1 screens, and the switches the settings drive (high-contrast
 * feedback, Reduce motion, Readable text) reaching the tokens.
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

/**
 * A practice question answered with its first option, repeated until a
 * wrong pick shows, so the reveal holds every answer state.
 */
async function revealWithAWrongPick(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Quick play" }).first().click();
  await expect(page).toHaveURL("/practice/run");
  for (let question = 1; question <= 10; question += 1) {
    await page.locator('main [data-state="idle"]').first().click();
    await expect(page.locator('[data-state="correct"]')).toHaveCount(1);
    if ((await page.locator('[data-state="your-answer"]').count()) > 0) return;
    await page.getByRole("button", { name: /^(Next question|Continue)/ }).click();
  }
  throw new Error("ten first options in a row were right");
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
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a[href], button")]
        .filter((element) => element.checkVisibility())
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            name: element.textContent?.trim() || element.getAttribute("aria-label"),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        })
        .filter((box) => box.width < 44 || box.height < 44),
    );
    expect(small).toEqual([]);
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
    await expect(page.locator('[data-state="correct"] svg').first()).toBeVisible();
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
});

test.describe("reflow at 320 px", () => {
  test.use({ viewport: { width: 320, height: 640 }, timezoneId: "Europe/London" });

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
    await expect(page.locator('main [data-state="idle"]').first()).toBeVisible();
    await expectNoHorizontalScroll(page, "a practice question");
    await page.locator('main [data-state="idle"]').first().click();
    await expect(page.locator('[data-state="correct"]')).toHaveCount(1);
    await expectNoHorizontalScroll(page, "a practice reveal");
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
      await page.getByRole("button", { name: /^(Next clue|Last clue)/ }).click();
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
      localStorage.setItem("qz:settings", JSON.stringify({ v: 1, motion: "on" }));
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
    expect(await distance()).toBe("0");
    await expect(page.getByRole("link", { name: "Quick play" }).first()).toHaveCSS(
      "transition-duration",
      /0\.14s/,
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      localStorage.setItem("qz:settings", JSON.stringify({ v: 1, motion: "off" }));
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
    expect(await distance()).toBe("1");
  });

  test("Readable text loosens the reading text to 0.05 em and a 1.6 line height", async ({
    page,
  }) => {
    await storeSettings(page, { v: 1, readableText: true });
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
        return Number.parseFloat(css.lineHeight) / Number.parseFloat(css.fontSize);
      });
    expect(line).toBeCloseTo(1.6, 2);
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
    expect(await page.evaluate(() => (window as { __seen?: string }).__seen)).toBe(
      "Daily #42 · Sunday 1 November",
    );
    await expect(page.locator("#qz-daily-slot")).not.toHaveAttribute(
      "data-pending",
    );
  });
});
