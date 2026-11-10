/**
 * RITE round 4's shell and design-system fixes (docs/playtests/rite-4.md §7
 * and §9, decisions memo §27), each test named for its finding: a visible
 * tooltip on the play header's X (R4-04), and toasts that keep clear of
 * the page's H1 as well as its controls (R4-06).
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { pickOption } from "../daily/clue-4";
import { allowClipboard } from "../support/clipboard";
import { setClock } from "../support/clock";
import { mockInit } from "../support/mock";

test.use({ timezoneId: "Europe/London" });

const NOV_1 = "2026-11-01T09:00:00";
const LONDON = "Europe/London";
const LEAVE_RUNNING =
  "Leave the Daily. Your progress is saved, and the stopwatch keeps running.";
const LEAVE_STOPPED = "Leave the Daily. Your progress is saved.";

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function intersects(a: Box, b: Box): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  if (found === null) throw new Error("no box");
  return {
    top: found.y,
    bottom: found.y + found.height,
    left: found.x,
    right: found.x + found.width,
  };
}

/** The toast on screen, not one leaving. */
const toast = (page: Page) => page.locator("[data-toast]:not([data-leaving])");
const tip = (page: Page) => page.locator("header [data-leave-tip]");

/** 200% text: the root's font size, which every rem follows. */
async function largeText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.style.fontSize = "200%";
    });
  });
}

/**
 * Samples, every 100 ms while the toast shows (up to `ms`), whether it
 * covers `target`; returns the moments it did.
 */
async function coverings(
  page: Page,
  target: Locator,
  ms = 2_000,
): Promise<string[]> {
  const hits: string[] = [];
  const start = Date.now();
  while (Date.now() - start < ms) {
    if ((await toast(page).count()) === 0) break;
    const [pill, under] = await Promise.all([
      box(toast(page)).catch(() => null),
      box(target).catch(() => null),
    ]);
    if (pill !== null && under !== null && intersects(pill, under)) {
      hits.push(
        `${Date.now() - start} ms: toast ${Math.round(pill.top)}-${Math.round(pill.bottom)}, target ${Math.round(under.top)}-${Math.round(under.bottom)}`,
      );
    }
    await page.waitForTimeout(100);
  }
  return hits;
}

test.describe("R4-04 the play header's X says what leaving does", () => {
  // A mouse and a keyboard: the tooltip is theirs.
  test.use({
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    isMobile: false,
  });

  test.beforeEach(async ({ page, browserName }) => {
    test.skip(
      browserName === "webkit",
      "isMobile can't be turned off for a WebKit phone project",
    );
    await setClock(page, NOV_1, LONDON);
    await page.goto("/daily");
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
  });

  test("R4-04 hovering the X shows a tooltip with the label's second sentence, and moving away hides it", async ({
    page,
  }) => {
    const leave = page.getByRole("link", { name: LEAVE_RUNNING, exact: true });
    await expect(tip(page)).toBeHidden();
    const header = await box(page.locator("header").first());
    await leave.hover();
    await expect(tip(page)).toBeVisible();
    await expect(tip(page)).toHaveText(
      "Your progress is saved, and the stopwatch keeps running.",
    );
    await expect(tip(page)).toBeInViewport({ ratio: 1 });
    // Under the X, touching it, so the pointer can move onto the words
    // (WCAG 1.4.13): still there with the pointer on the tooltip itself.
    const words = await box(tip(page));
    const x = await box(leave);
    expect(words.top).toBeGreaterThanOrEqual(x.bottom - 1);
    expect(words.top - x.bottom).toBeLessThanOrEqual(1);
    await page.mouse.move(words.left + 20, words.top + 10);
    await page.waitForTimeout(300);
    await expect(tip(page)).toBeVisible();
    // The bar is as tall as it was: nothing under it moved.
    expect(await box(page.locator("header").first())).toEqual(header);
    // The words are for the eye; the link's name already says them.
    await expect(tip(page)).toHaveAttribute("aria-hidden", "true");
    await page.mouse.move(640, 600);
    await expect(tip(page)).toBeHidden();
    // Still on the Daily: the tooltip is no link.
    await expect(page).toHaveURL("/daily");
  });

  test("R4-04 keyboard focus on the X shows the tooltip, and Escape puts it away without moving focus", async ({
    page,
  }) => {
    const leave = page.getByRole("link", { name: LEAVE_RUNNING, exact: true });
    await leave.focus();
    await expect(tip(page)).toBeVisible();
    await expect(tip(page)).toHaveText(
      "Your progress is saved, and the stopwatch keeps running.",
    );
    await page.keyboard.press("Escape");
    await expect(tip(page)).toBeHidden();
    await expect(leave).toBeFocused();
    // Gone with the focus, and back the next time focus arrives.
    await page.keyboard.press("Tab");
    await expect(tip(page)).toBeHidden();
    await page.keyboard.press("Shift+Tab");
    await expect(leave).toBeFocused();
    await expect(tip(page)).toBeVisible();
  });

  test("R4-04 on a reveal, where the clock is stopped, the tooltip says only that progress is saved", async ({
    page,
  }) => {
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    await pickOption(page, "Odile Marsh");
    await expect(
      page.getByRole("button", { name: "Next mystery" }),
    ).toBeVisible();
    const leave = page.getByRole("link", { name: LEAVE_STOPPED, exact: true });
    await leave.hover();
    await expect(tip(page)).toBeVisible();
    await expect(tip(page)).toHaveText("Your progress is saved.");
  });

  test("R4-04 practice's X, whose name is one sentence, has no tooltip", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator('[data-home-slot="practice"]')
      .getByRole("link", { name: "Quick play" })
      .click();
    await expect(page).toHaveURL("/practice/run");
    const leave = page.getByRole("link", { name: "Leave practice" });
    await leave.hover();
    await expect(page.locator("[data-leave-tip]:visible")).toHaveCount(0);
  });
});

test.describe("R4-06 toasts clear of the page's H1", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`R4-06 at ${viewport.width} x ${viewport.height}, the Copied toast covers neither the stop screen's H1 nor Share`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize(viewport);
      await allowClipboard(page, browserName);
      await mockInit(page, { scenario: "finished_today" });
      await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
      await page.goto("/daily/42/results");
      const heading = page.getByRole("heading", {
        level: 1,
        name: "Daily #42",
      });
      await expect(heading).toBeVisible();
      const share = page.locator("[data-share-button] button");
      await share.click();
      await expect(toast(page)).toBeVisible();
      await expect(toast(page)).toBeInViewport({ ratio: 1 });
      const [onHeading, onShare] = await Promise.all([
        coverings(page, heading),
        coverings(page, share),
      ]);
      expect(onHeading).toEqual([]);
      expect(onShare).toEqual([]);
    });
  }

  test("R4-06 at 390 x 844 with Share just above the dock, where the toast went up onto the heading, it now sits clear of both", async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await allowClipboard(page, browserName);
    await mockInit(page, { scenario: "finished_today" });
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily/42/results");
    const heading = page.getByRole("heading", { level: 1, name: "Daily #42" });
    const share = page.locator("[data-share-button] button");
    await expect(share).toBeVisible();
    // A control under the toast's usual place: with nothing scrolled, the
    // share box or the rounds sit above the dock.
    await share.click();
    await expect(toast(page)).toBeVisible();
    const pill = await box(toast(page));
    const header = await box(page.locator("header").first());
    expect(pill.top).toBeGreaterThanOrEqual(header.bottom);
    expect(intersects(pill, await box(heading))).toBe(false);
    expect(intersects(pill, await box(share))).toBe(false);
    // It may sit on the date line under the heading, the first gap that
    // clears both: accepted (DESIGN §6.9), since anything lower is the
    // stamp or the score.
    // No control at all under it.
    const covered = await page.evaluate(() => {
      const toast = document.querySelector("[data-toast]:not([data-leaving])");
      if (toast === null) return ["no toast"];
      const pill = toast.getBoundingClientRect();
      return [
        ...document.querySelectorAll<HTMLElement>(
          "main a[href], main button, main textarea, main h1",
        ),
      ]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.width > 1 &&
            box.height > 1 &&
            box.left < pill.right &&
            pill.left < box.right &&
            box.top < pill.bottom &&
            pill.top < box.bottom
          );
        })
        .map(
          (element) =>
            element.tagName + ":" + element.textContent?.slice(0, 20),
        );
    });
    expect(covered).toEqual([]);
  });

  for (const { viewport, large } of [
    { viewport: { width: 390, height: 844 }, large: false },
    // Where "Saved" went under "Good morning." onto the card's title,
    // the line that says which Daily was saved (review of R4-06).
    { viewport: { width: 320, height: 568 }, large: false },
    { viewport: { width: 390, height: 844 }, large: true },
  ]) {
    test(`R4-06 with 'Saved' on Today at ${viewport.width} x ${viewport.height}${large ? " and 200% text" : ""}, the toast keeps off Today's heading and the Continue card's title`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      if (large) await largeText(page);
      await setClock(page, NOV_1, LONDON);
      await page.goto("/daily");
      await expect(
        page.getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: LEAVE_RUNNING, exact: true })
        .click();
      await expect(page).toHaveURL("/");
      await expect(toast(page)).toBeVisible();
      const heading = page.locator("main h1").first();
      await expect(heading).toBeVisible();
      const title = page.locator("[data-daily-card] h2");
      await expect(title).toHaveText(/^Continue Daily #/);
      const resume = page.getByRole("link", { name: /^Continue/ });
      const [onHeading, onTitle, onResume] = await Promise.all([
        coverings(page, heading, 1_500),
        coverings(page, title, 1_500),
        coverings(page, resume, 1_500),
      ]);
      expect(onHeading).toEqual([]);
      expect(onTitle).toEqual([]);
      expect(onResume).toEqual([]);
    });
  }
});
