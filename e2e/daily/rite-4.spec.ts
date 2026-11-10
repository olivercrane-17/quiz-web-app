/**
 * RITE round 4's Daily fixes (docs/playtests/rite-4.md §7 and §9, decisions
 * memo §27), each test named for its finding: the running time on Today's
 * Continue card (R4-04), the stop screen's room above its sticky bar and
 * Share's "Copied" (R4-06), a results line that promises no archive (R4-08)
 * and How scoring works saying each thing once (R4-20).
 *
 * R4-04 runs on a real clock, as R3-01's tests do: the page's date is moved
 * by an offset on `Date` alone, so time passes at its own pace for the
 * page, its timers and the mock server alike.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { allowClipboard } from "../support/clipboard";
import { localInstant } from "../support/clock";
import { mockInit } from "../support/mock";
import { pickOption } from "./clue-4";
import { stopwatchText } from "./stopwatch";

test.use({ timezoneId: "Europe/London" });

const LONDON = "Europe/London";
/** 09:00 in London on Tuesday 10 November 2026: Daily #51. */
const NOV_10 = "2026-11-10T09:00:00";
const LEAVE_RUNNING =
  "Leave the Daily. Your progress is saved, and the stopwatch keeps running.";

const round = (page: Page) => page.locator("[data-round-area]");
const card = (page: Page) => page.locator('[data-daily-card="in_progress"]');
/** The Continue card's running time, beside its sentence. */
const cardTime = (page: Page) => card(page).locator("[data-daily-clock-time]");

/** `m:ss` at the end of a text, in seconds. */
function seconds(text: string): number {
  const match = /(\d+):(\d\d)\s*$/.exec(text);
  if (match === null) throw new Error(`no time in "${text}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Moves the page's calendar to `local` in `zone`; its clock keeps real pace. */
async function realClockAt(page: Page, local: string, zone: string) {
  const offset = localInstant(local, zone) - Date.now();
  await page.addInitScript((shift: number) => {
    const RealDate = Date;
    class ShiftedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(RealDate.now() + shift);
        else super(...(args as [number]));
      }
      static override now(): number {
        return RealDate.now() + shift;
      }
    }
    globalThis.Date = ShiftedDate as DateConstructor;
  }, offset);
}

/** Mystery 1 on its last clue's right option, then Mystery 2's clue 1, open. */
async function toMystery2(page: Page): Promise<void> {
  await page.goto("/daily");
  await expect(
    round(page).getByRole("heading", { name: /clue 1/i }),
  ).toBeVisible();
  for (let clue = 1; clue < 4; clue += 1) {
    await page.getByRole("button", { name: /^(Next clue|Last clue)/ }).click();
  }
  await pickOption(page, "The Lantern Keeper");
  await page.getByRole("button", { name: "Next mystery" }).click();
  await expect(
    round(page).getByRole("heading", { name: /clue 1/i }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: /progress/i })).toBeVisible();
}

test.describe("R4-04 the Continue card's running time", () => {
  test.beforeEach(async ({ page }) => {
    await realClockAt(page, NOV_10, LONDON);
  });

  test("R4-04 leaving Mystery 2 at a known reading, the card shows that reading plus the time away, three seconds on and again on Continue", async ({
    page,
  }) => {
    await toMystery2(page);
    // A little into Mystery 2, so the reading isn't 0:00 by luck.
    await page.waitForTimeout(1_200);
    const reading = seconds(await stopwatchText(page));
    const leftAt = Date.now();
    await page.getByRole("link", { name: LEAVE_RUNNING, exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(card(page)).toContainText("Your stopwatch is still running.");
    await expect(cardTime(page)).toBeVisible();

    // Wait until three seconds have passed since the reading.
    await page.waitForTimeout(Math.max(0, 3_000 - (Date.now() - leftAt)));
    const shown = seconds((await cardTime(page).textContent()) ?? "");
    const away = (Date.now() - leftAt) / 1000;
    // Both are whole seconds of one running clock: the reading plus the
    // time since, within a second.
    expect(Math.abs(shown - (reading + away))).toBeLessThanOrEqual(1);
    expect(shown).toBeGreaterThanOrEqual(reading + 2);

    // It ticks: a second later it reads more.
    await expect
      .poll(async () => seconds((await cardTime(page).textContent()) ?? ""), {
        timeout: 3_000,
      })
      .toBeGreaterThan(shown);

    // And Continue's header picks up where the card was.
    const before = seconds((await cardTime(page).textContent()) ?? "");
    await card(page).getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL("/daily");
    await expect(
      round(page).getByRole("heading", { name: /clue 1/i }),
    ).toBeVisible();
    const resumed = seconds(await stopwatchText(page));
    expect(resumed).toBeGreaterThanOrEqual(before);
    expect(resumed).toBeLessThanOrEqual(before + 3);
  });

  test("R4-04 the card's time sits in the sentence's line, reads Time so far to a screen reader, and is in no live region", async ({
    page,
  }) => {
    await toMystery2(page);
    await page.getByRole("link", { name: LEAVE_RUNNING, exact: true }).click();
    await expect(cardTime(page)).toBeVisible();
    await expect(card(page).locator("[data-daily-clock]")).toHaveText(
      /^Your stopwatch is still running\. Time so far \d+:\d\d$/,
    );
    expect(
      await cardTime(page).evaluate(
        (time) =>
          time.closest(
            "[aria-live], [role=status], [role=alert], [role=timer], [role=log]",
          ) === null,
      ),
    ).toBe(true);
    // Nothing is said as it turns: the status regions stay as they were.
    const said = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("[aria-live]")]
          .map((region) => region.textContent ?? "")
          .join("|"),
      );
    const first = await said();
    await page.waitForTimeout(2_200);
    expect(await said()).not.toMatch(/\d:\d\d/);
    expect((await said()).length).toBeLessThanOrEqual(first.length);
  });

  test("R4-04 with the stopwatch hidden, the card keeps its sentence and shows no time", async ({
    page,
  }) => {
    await toMystery2(page);
    await page.getByRole("button", { name: /Time so far/ }).click();
    await page.getByRole("menuitem", { name: "Hide stopwatch" }).click();
    await expect(page.locator("[data-stopwatch]")).toHaveCount(0);
    await page.getByRole("link", { name: LEAVE_RUNNING, exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(card(page)).toContainText("Your stopwatch is still running.");
    await page.waitForTimeout(2_000);
    await expect(cardTime(page)).toHaveCount(0);
    await expect(card(page)).not.toContainText(/\d:\d\d/);
    await expect(card(page)).not.toContainText("Time so far");
  });

  test("R4-04 the time arriving doesn't move Continue", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await toMystery2(page);
    await page.getByRole("link", { name: LEAVE_RUNNING, exact: true }).click();
    const resume = card(page).getByRole("link", { name: "Continue" });
    await expect(resume).toBeVisible();
    const before = await resume.boundingBox();
    await expect(cardTime(page)).toBeVisible();
    await page.waitForTimeout(1_200);
    expect(await resume.boundingBox()).toEqual(before);
  });
});

test.describe("R4-06 the stop screen", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test.describe(`at ${viewport.width} x ${viewport.height}`, () => {
      test.use({ viewport });

      test.beforeEach(async ({ page, browserName }) => {
        await allowClipboard(page, browserName);
        await mockInit(page, { scenario: "finished_today" });
        await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
        await page.goto("/daily/42/results");
        await expect(
          page.getByRole("heading", { level: 1, name: "Daily #42" }),
        ).toBeVisible();
      });

      test("R4-06 the share preview's last line scrolls above the sticky bar, and the page ends with no empty band", async ({
        page,
      }) => {
        // The bar is sticky in the page's flow, so it takes its own room
        // before the last links: the preview always scrolls clear of it,
        // on the old layout too. What this holds is that no fix pads the
        // page's end again (a bar's height of padding left 105 px of blank
        // under the last link, and brought nothing clear that wasn't).
        // On load at 1280 x 800 the bar still crosses the preview, as any
        // content at the fold: that is the bar's design (DESIGN §12.4).
        const dock = page.locator("[data-results-dock]");
        const preview = page.locator("[data-share-text]");
        const dockHeight = (await dock.boundingBox())?.height ?? 0;
        expect(dockHeight).toBeGreaterThan(40);
        // Scrolled by the keyboard or the wheel as far as needed, the
        // preview's last line clears the bar, with room to spare.
        await preview.evaluate((box) => {
          box.scrollIntoView({ block: "center" });
        });
        const bar = await dock.boundingBox();
        const text = await preview.boundingBox();
        expect(bar).not.toBeNull();
        expect(text).not.toBeNull();
        if (bar === null || text === null) return;
        expect(text.y + text.height).toBeLessThanOrEqual(bar.y);
        // At the very end of the page the bar has left the content alone:
        // it sits in its own place, above the last links, which end the
        // page's usual 24 px from the bottom and no further.
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        const last = await page
          .getByRole("link", { name: "Want more? Try a practice round." })
          .boundingBox();
        const barAtEnd = await dock.boundingBox();
        expect(last).not.toBeNull();
        expect(barAtEnd).not.toBeNull();
        if (last === null || barAtEnd === null) return;
        expect(barAtEnd.y + barAtEnd.height).toBeLessThanOrEqual(last.y);
        expect(last.y + last.height).toBeLessThanOrEqual(viewport.height);
        expect(viewport.height - (last.y + last.height)).toBeLessThanOrEqual(
          32,
        );
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
      });

      test("R4-06 Share's own label reads Copied for two seconds, then Share, and nothing beside it moves", async ({
        page,
      }) => {
        const button = page.locator("[data-share-button] button");
        await expect(button).toHaveText("Share");
        const row = page.locator("[data-share-actions]");
        const before = await button.boundingBox();
        const rowBefore = await row.boundingBox();
        await button.click();
        const pressedAt = Date.now();
        await expect(button).toHaveText("Copied");
        await expect(button).toHaveAccessibleName("Copied");
        expect(await button.boundingBox()).toEqual(before);
        expect(await row.boundingBox()).toEqual(rowBefore);
        // Still Copied well into the second second.
        await page.waitForTimeout(
          Math.max(0, 1_500 - (Date.now() - pressedAt)),
        );
        await expect(button).toHaveText("Copied");
        await expect(button).toHaveText("Share", { timeout: 2_000 });
        expect(Date.now() - pressedAt).toBeGreaterThanOrEqual(1_900);
        expect(await button.boundingBox()).toEqual(before);
        // The text went to the clipboard as before.
        await expect(page.locator("[data-toast]")).toContainText("Copied.");
      });
    });
  }
});

test.describe("R4-08 another day's results", () => {
  test("R4-08 on day 2, /daily/51/results says nothing of an archive and offers Today", async ({
    page,
  }) => {
    // Wednesday 11 November 2026: Daily #52, the day after #51.
    await page.clock.setFixedTime(
      new Date(localInstant("2026-11-11T09:00:00", LONDON)),
    );
    await page.goto("/daily/51/results");
    await expect(
      page.getByText("Results are only kept for today's Daily."),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/archive/i);
    await expect(
      page.getByRole("link", { name: "Go to Today", exact: true }),
    ).toHaveAttribute("href", "/");
    await expect(page.locator('a[href="/archive"]')).toHaveCount(0);
  });
});

test.describe("R4-20 How scoring works", () => {
  test("R4-20 no paragraph, list item or sentence appears twice on the page", async ({
    page,
  }) => {
    await page.goto("/how-scoring-works");
    await expect(
      page.getByRole("heading", { level: 1, name: "How scoring works" }),
    ).toBeVisible();
    const texts = await page
      .locator("main")
      .locator("p, li, dd")
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.querySelector("p, li, dd") === null)
          .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
          .filter((text) => text.split(" ").length >= 4),
      );
    expect(texts.length).toBeGreaterThan(20);
    const twice = (values: string[]) =>
      values.filter((value, index) => values.indexOf(value) !== index);
    expect(twice(texts)).toEqual([]);
    const sentences = texts.flatMap((text) =>
      text
        .split(/(?<=[.!?”])\s+(?=[A-Z“])/)
        .filter((sentence) => sentence.split(" ").length >= 4),
    );
    expect(twice(sentences)).toEqual([]);
    // The chart of how everyone did is named once.
    expect(
      texts.join(" ").match(/The chart of how everyone did/g),
    ).toHaveLength(1);
  });
});
