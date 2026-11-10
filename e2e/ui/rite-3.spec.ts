/**
 * RITE round 3's findings for the shell and the primitives (FIX3-DS;
 * docs/playtests/rite-3.md §5, §7 and §9, decisions memo §26), each
 * reproduced the way the personas met it, on the mock build. Every title
 * starts with its finding's id.
 *
 * - R3-08: a toast never sits on a control. At 200% text Sam's "Saved. The
 *   stopwatch keeps running." covered Today's Continue for 4 s while the
 *   clock ran, and Lena's copy toast covered Share. Today's title, which
 *   the route announcer reads, is "Today · Knewt".
 * - R3-09: the results page keeps no "Time so far" stopwatch from the
 *   Daily it came from, and Hide stopwatch says "Stopwatch hidden. It still
 *   runs for tie-breaks."
 * - R3-10: the focused skip link sits above the sticky header.
 *
 * Daily #42 (Sunday 1 November): a person (Odile Marsh), a country
 * (Valdoria) and an element (bismuth), then an Encore of 86.4 m.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { allowClipboard } from "../support/clipboard";
import { setClock } from "../support/clock";
import { mockInit } from "../support/mock";

test.use({ timezoneId: "Europe/London" });

const NOV_1 = "2026-11-01T09:00:00";
const LONDON = "Europe/London";
const PHONE = { width: 390, height: 844 };

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

/** 200% text, as Sam set it: the root's font size, which every rem follows. */
async function largeText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.style.fontSize = "200%";
    });
  });
}

/**
 * Samples, every 100 ms while the toast shows (up to `ms`), whether it
 * covers `control`; returns the moments it did.
 */
async function coverings(
  page: Page,
  control: Locator,
  ms = 4_000,
): Promise<string[]> {
  const hits: string[] = [];
  const start = Date.now();
  while (Date.now() - start < ms) {
    if ((await toast(page).count()) === 0) break;
    const [pill, target] = await Promise.all([
      box(toast(page)).catch(() => null),
      box(control).catch(() => null),
    ]);
    if (pill !== null && target !== null && intersects(pill, target)) {
      hits.push(
        `${Date.now() - start} ms: toast ${Math.round(pill.top)}-${Math.round(pill.bottom)}, control ${Math.round(target.top)}-${Math.round(target.bottom)}`,
      );
    }
    await page.waitForTimeout(100);
  }
  return hits;
}

/** Next clue to the last clue, then the clue-4 option named `name`. */
async function toOptionsAndPick(page: Page, name: RegExp): Promise<void> {
  for (let clue = 1; clue < 4; clue += 1) {
    await page.getByRole("button", { name: /^(Next clue|Last clue)/ }).click();
  }
  await page.getByRole("button", { name }).click();
}

/** Plays #42 to its stop screen on Next clue and the right options. */
async function toTheResults(page: Page): Promise<void> {
  for (const [answer, next] of [
    [/Odile Marsh/, "Next mystery"],
    [/Valdoria/, "Next mystery"],
    [/Bismuth/, "On to the Encore"],
  ] as const) {
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await toOptionsAndPick(page, answer);
    await page.getByRole("button", { name: next }).click();
  }
  await page.getByLabel(/your number/i).fill("80");
  await page.getByRole("button", { name: "Lock in" }).click();
  await page.getByRole("button", { name: "See your results" }).click();
  await expect(page).toHaveURL("/daily/42/results");
}

test.describe("R3-08 toasts clear of the page's controls", () => {
  test("R3-08 at 200% text on a phone, leaving the Daily with a clue open: 'Saved. The stopwatch keeps running.' never covers Today's Continue", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await largeText(page);
    await setClock(page, NOV_1, LONDON);
    await page.goto("/daily");
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await page.getByRole("link", { name: /^Leave the Daily/ }).click();
    await expect(page).toHaveURL("/");
    await expect(toast(page)).toHaveText("Saved. The stopwatch keeps running.");
    const resume = page.getByRole("link", { name: /^Continue/ });
    await expect(resume).toBeVisible();
    // Sam's screen: Continue at the bottom, where the toast rises.
    await resume.evaluate((link) => {
      const bar = document.querySelector("[data-toast-anchor]");
      const barTop = bar?.getBoundingClientRect().top ?? window.innerHeight;
      const { bottom } = link.getBoundingClientRect();
      window.scrollBy(0, bottom - barTop + 20);
    });
    expect(await coverings(page, resume, 3_500)).toEqual([]);
  });

  test("R3-08 a toast over a control moves under the header, and the copy toast never covers Share", async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await largeText(page);
    await allowClipboard(page, browserName);
    await mockInit(page, { scenario: "finished_today" });
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily/42/results");
    const share = page.getByRole("button", { name: /^Share/ });
    await expect(share).toBeVisible();
    // Lena's screen: Share just above the dock, where the toast rises.
    await share.evaluate((button) => {
      const dock = document.querySelector("[data-toast-anchor]");
      const dockTop = dock?.getBoundingClientRect().top ?? window.innerHeight;
      const { bottom } = button.getBoundingClientRect();
      window.scrollBy(0, bottom - dockTop + 24);
    });
    await share.click();
    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toHaveAttribute("data-place", "top");
    const pill = await box(toast(page));
    const header = await box(page.locator("header").first());
    expect(pill.top).toBeGreaterThanOrEqual(header.bottom);
    expect(await coverings(page, share, 2_000)).toEqual([]);
  });

  test("R3-08 at 320 px and 200% text, with Share between both places, the copy toast sinks toward the dock and clears it", async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await largeText(page);
    await allowClipboard(page, browserName);
    await mockInit(page, { scenario: "finished_today" });
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily/42/results");
    const share = page.getByRole("button", { name: /^Share/ });
    await expect(share).toBeVisible();
    // No scrolling: Share sits where the pill's top place and its usual
    // place above the dock each overlap it.
    await share.click();
    await expect(toast(page)).toBeVisible();
    expect(await coverings(page, share, 2_000)).toEqual([]);
    const pill = await box(toast(page));
    const dock = await box(page.locator("[data-toast-anchor]").first());
    expect(dock.top - pill.bottom).toBeGreaterThanOrEqual(4);
  });

  for (const width of [320, 360]) {
    test(`R3-08 in dark at ${width} px, a toast placed at the top holds 3:1 at its edge against what lies under it`, async ({
      page,
      browserName,
    }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.setViewportSize({ width, height: 640 });
      await largeText(page);
      await allowClipboard(page, browserName);
      await mockInit(page, { scenario: "finished_today" });
      await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
      await page.goto("/daily/42/results");
      const share = page.getByRole("button", { name: /^Share/ });
      await expect(share).toBeVisible();
      await share.evaluate((button) => {
        const dock = document.querySelector("[data-toast-anchor]");
        const dockTop = dock?.getBoundingClientRect().top ?? window.innerHeight;
        const { bottom } = button.getBoundingClientRect();
        window.scrollBy(0, bottom - dockTop + 24);
      });
      await share.click();
      await expect(toast(page)).toHaveAttribute("data-place", "top");
      // Let it finish rising in.
      await page.waitForTimeout(400);
      const measure = () =>
        toast(page).evaluate((pill) => {
          const rgb = (value: string) =>
            (value.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
          const luminance = ([r = 0, g = 0, b = 0]: number[]) => {
            const [lr, lg, lb] = [r, g, b].map((c) => {
              const s = c / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * (lr ?? 0) + 0.7152 * (lg ?? 0) + 0.0722 * (lb ?? 0);
          };
          const contrast = (a: number[], b: number[]) => {
            const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
            return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
          };
          const style = getComputedStyle(pill);
          const ring = rgb(style.borderTopColor);
          const fill = rgb(style.backgroundColor);
          const { left, right, top, bottom } = pill.getBoundingClientRect();
          // What is painted just outside the pill's edge, on each side.
          const under = (x: number, y: number) => {
            let element: Element | null =
              document
                .elementsFromPoint(x, y)
                .find((found) => !pill.contains(found)) ?? null;
            while (element !== null) {
              const colour = rgb(getComputedStyle(element).backgroundColor);
              if ((colour[3] ?? 1) > 0.5) return colour;
              element = element.parentElement;
            }
            return rgb(getComputedStyle(document.body).backgroundColor);
          };
          const middle = (left + right) / 2;
          const around = [
            under(middle, top + 1),
            under(middle, bottom - 1),
            under(left + 1, (top + bottom) / 2),
            under(right - 1, (top + bottom) / 2),
          ];
          // The pill's edge shows where its ring meets what is under it or,
          // where the ring merges with that (charcoal on the dark page), where
          // the ring meets the fill. A transparent ring is what is under it.
          const opaque = (ring[3] ?? 1) > 0.5;
          return {
            edge: Math.min(
              ...around.map((colour) => {
                const seen = opaque ? ring : colour;
                return Math.max(contrast(seen, colour), contrast(fill, seen));
              }),
            ),
            onItsOwnColour: around.filter(
              (colour) => contrast(fill, colour) < 1.5,
            ).length,
          };
        });
      // On the page as it is: the dark header, the card and its charcoal
      // inset (memo §26).
      expect((await measure()).edge).toBeGreaterThanOrEqual(3);
      // And on a surface of its own colour, the worst case its ring is for:
      // a strip of the pill's own fill, laid under it and a little past it
      // on every side (a cream button or ticket label in dark).
      await toast(page).evaluate((pill) => {
        const { left, top, width, height } = pill.getBoundingClientRect();
        const style = getComputedStyle(pill);
        const strip = document.createElement("div");
        strip.setAttribute("data-test-backdrop", "");
        Object.assign(strip.style, {
          position: "fixed",
          left: `${left - 8}px`,
          top: `${top - 8}px`,
          width: `${width + 16}px`,
          height: `${height + 16}px`,
          background: style.backgroundColor,
          zIndex: style.zIndex,
        });
        // Before the pill in the page, so at the same z-index it paints
        // under it.
        pill.parentElement?.insertBefore(strip, pill);
      });
      const onOwn = await measure();
      expect(onOwn.onItsOwnColour).toBe(4);
      expect(onOwn.edge).toBeGreaterThanOrEqual(3);
    });
  }

  test("R3-08 a toast with nothing under it still rises 16 px above the tab bar", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await setClock(page, NOV_1, LONDON);
    await page.goto("/daily");
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await page.getByRole("link", { name: /^Leave the Daily/ }).click();
    await expect(page).toHaveURL("/");
    await expect(toast(page)).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    const bar = await box(page.locator("[data-toast-anchor]").first());
    await expect
      .poll(async () => {
        const pill = await box(toast(page));
        return [
          await toast(page).getAttribute("data-place"),
          Math.round(bar.top - pill.bottom),
        ];
      })
      .toEqual(["bottom", 16]);
  });

  test("R3-08 the route announcer says 'Today · Knewt' on arriving at Today", async ({
    page,
  }) => {
    await page.goto("/practice");
    await expect(page).toHaveTitle(/· Knewt$/);
    // Once Today's route is prefetched, as it is for anyone who reads the
    // page first. A click in the first 100 ms of a cold load can beat
    // Next's streamed title, and then its announcer reads the h1.
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true })
      .getByRole("link", { name: "Today" })
      .click();
    await expect(page).toHaveURL("/");
    await expect(page).toHaveTitle("Today · Knewt");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .querySelector("next-route-announcer")
              ?.shadowRoot?.textContent?.trim() ?? "",
        ),
      )
      .toBe("Today · Knewt");
  });
});

test.describe("R3-09 the stopwatch's words", () => {
  test("R3-09 the results page holds no 'Time so far', shown or hidden, after a Daily played to the end", async ({
    page,
  }) => {
    await setClock(page, NOV_1, LONDON);
    await page.goto("/daily");
    await expect(page.locator("[data-stopwatch]")).toContainText("Time so far");
    await toTheResults(page);
    await expect(page.locator("[data-time]")).toBeVisible();
    // Next keeps the Daily's page in the document, hidden (a second, hidden
    // <main>): nothing of its stopwatch may stay, in the text or as a
    // region.
    await expect
      .poll(() =>
        page.evaluate(() => ({
          hiddenDaily: [...document.querySelectorAll("main")].some(
            (main) => !main.checkVisibility(),
          ),
          text: document.body.textContent?.includes("Time so far") ?? false,
          watches: document.querySelectorAll("[data-stopwatch]").length,
        })),
      )
      .toEqual({ hiddenDaily: true, text: false, watches: 0 });
    await expect(page.getByText("Time so far")).toHaveCount(0);
  });

  test("R3-09 Hide stopwatch says 'Stopwatch hidden. It still runs for tie-breaks.' in the status region", async ({
    page,
  }) => {
    await setClock(page, NOV_1, LONDON);
    await page.goto("/daily");
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await page.getByRole("button", { name: /Time so far/ }).click();
    await page.getByRole("menuitem", { name: "Hide stopwatch" }).click();
    await expect(page.locator("[data-stopwatch]")).toHaveCount(0);
    await expect(page.locator("#qz-live-polite, [role=status]")).toContainText([
      "Stopwatch hidden. It still runs for tie-breaks.",
    ]);
  });
});

test.describe("R3-10 the skip link", () => {
  for (const path of ["/", "/daily"]) {
    test(`R3-10 on ${path} at 200% text, the focused skip link sits whole above the sticky header`, async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await largeText(page);
      await setClock(page, NOV_1, LONDON);
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const skip = page.getByRole("link", { name: "Skip to content" });
      await skip.focus();
      await expect(skip).toBeFocused();
      // The middle of each edge and the centre: its rounded corners show
      // what is behind them by design.
      const covered = await skip.evaluate((link) => {
        const box = link.getBoundingClientRect();
        const x = (box.left + box.right) / 2;
        const y = (box.top + box.bottom) / 2;
        const points = [
          [x, box.top + 2],
          [x, box.bottom - 2],
          [box.left + 2, y],
          [box.right - 2, y],
          [x, y],
        ] as const;
        return points.filter(([px, py]) => {
          const hit = document.elementFromPoint(px, py);
          return hit === null || !link.contains(hit);
        }).length;
      });
      expect(covered).toBe(0);
    });
  }
});
