/**
 * RITE round 1's findings for the shell and the primitives (FIX-DS;
 * docs/playtests/rite-1.md §7, decisions memo §19 D6, D11 and D18), each
 * reproduced the way the personas met it, on the mock build. Every title
 * starts with its finding's id.
 *
 * - R1-02: no link the shell draws ends on the framework's bare 404; an
 *   unknown address gets DESIGN §12.42's page inside the shell.
 * - R1-12: keyboard focus never lands under the sticky header, the tab bar
 *   or the play header, at 200% zoom and 200% text.
 * - R1-09: one visible `main#main`; the status region holds nothing from
 *   the page before; the route announcer reads the new page's own title
 *   where the new page's prefetch has landed (two cases stay `fixme` for
 *   FIX-PRA); keyboard focus survives a move between route groups.
 * - R1-20: Knewt in every title, the description and the link preview.
 * - R1-08, R1-27: pills, segments, chips and the stopwatch reading are
 *   flat marks; the current pill is marked by a bar, not a ring.
 * - R1-03: the Daily header never runs off a 320 px screen or 200% text.
 * - R1-36, R1-13, R1-40: an option's name sits centred on its badge and
 *   never squeezes at the reveal; its verdict words sit beside a name that
 *   leaves room, under one that doesn't, so nothing below a short option
 *   moves more than 10 px (DESIGN §7.1); it shows one key hint and holds
 *   its letter once; the practice segments keep the right gutter; no sheet
 *   handle that doesn't drag.
 * - R1-35: Today opens at its top, is two columns from 1024 px with Quick
 *   play on one line, names the date once in its dateline, greets a
 *   newcomer with what the Daily asks, and says "Hello." from midnight to
 *   4:59.
 * - R1-34: one 3 px ring everywhere, `summary` included; the h1 stays the
 *   largest heading at 200% text, and no page's heading runs off a 320 px
 *   screen; the tab labels stay apart.
 */
import type { CDPSession, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { setClock } from "../support/clock";

const NOT_FOUND_HEADING = "We couldn't find that page.";

/**
 * Chromium reports a 404 document, or a 404 page fetched by the router, as
 * a failed resource. A test that opens one on purpose expects exactly that
 * (as e2e/routing/rewrites.spec.ts does for Beta pages), and drops it.
 */
function dropExpected(consoleErrors: string[], pattern: RegExp): void {
  for (let index = consoleErrors.length - 1; index >= 0; index -= 1) {
    if (pattern.test(consoleErrors[index] ?? "")) {
      consoleErrors.splice(index, 1);
    }
  }
}
const NOT_FOUND_LOAD = /Failed to load resource: .*status of 404 \(Not Found\)/;

/** Today, hydrated, with its Daily card in. */
async function openToday(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-daily-card]")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** The links the shell's chrome draws on the page now: the top bar, the visible tab bar, the footer. */
async function shellLinks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const chrome = [
      ...document.querySelectorAll<HTMLElement>(
        "header.kn-topbar, nav[aria-label='Main'], footer.kn-footer",
      ),
    ].filter((part) => part.checkVisibility());
    const hrefs = chrome.flatMap((part) =>
      [...part.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .filter((link) => link.checkVisibility())
        .map((link) => link.getAttribute("href") ?? ""),
    );
    return [...new Set(hrefs)];
  });
}

/** A page inside the shell: one h1, the Main navigation and a way to Today, never the bare 404. */
async function expectPageInTheShell(page: Page): Promise<void> {
  await expect(page.getByText("This page could not be found")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^(Go to Today|Today)$/ }).first(),
  ).toBeVisible();
}

/** The text Next's route announcer holds (inside its shadow root). */
async function announcer(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      document
        .querySelector("next-route-announcer")
        ?.shadowRoot?.querySelector("#__next-route-announcer__")?.textContent ??
      "",
  );
}

const politeRegion = (page: Page) => page.locator("#qz-live-polite");

const round = (page: Page) => page.locator('[data-round="choice"]');
const options = (page: Page) =>
  round(page).locator("[data-question] ol").getByRole("button");

async function startQuickPlay(page: Page): Promise<void> {
  await openToday(page);
  // Once a run is open, FIX-PRA's card carries it on instead (R1-36).
  await page
    .locator('[data-home-slot="practice"]')
    .getByRole("link", { name: /^(Quick play|Continue practice)/ })
    .click();
  await expect(page).toHaveURL("/practice/run");
  await expect(options(page).first()).toBeVisible();
}

/** Picks the first option and taps the question, which completes the reveal at once. */
async function answerFirst(page: Page): Promise<void> {
  await options(page).first().click();
  await expect(options(page).first()).toHaveAttribute(
    "data-state",
    /^(correct|your-answer)$/,
  );
  await round(page).getByRole("heading", { level: 1 }).click();
  await expect(round(page).getByRole("region")).toBeVisible();
}

/**
 * The box of whatever has focus and the bars around it, marking the
 * element so a walk knows when focus comes round again. `inBar` covers the
 * bars' own controls and the skip link, which floats over the header.
 */
async function focusAndBars(page: Page) {
  return page.evaluate(async () => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) {
      return null;
    }
    // Focus scrolls the box into view, and at 640 by 400 WebKit can still
    // be scrolling when Tab returns (a flake): measure once the box and the
    // scroll position hold still across two frames, for at most 60 frames.
    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const place = () =>
      `${element.getBoundingClientRect().top} ${window.scrollY}`;
    let last = place();
    for (let tries = 0; tries < 60; tries += 1) {
      await frame();
      await frame();
      const now = place();
      if (now === last) break;
      last = now;
    }
    const shown = (selector: string) =>
      [...document.querySelectorAll<HTMLElement>(selector)].find((bar) =>
        bar.checkVisibility(),
      ) ?? null;
    const top = shown("header.kn-topbar, header.kn-playbar");
    const bottom = shown("nav.kn-tabbar");
    const seen = element.dataset.e2eSeen !== undefined;
    element.dataset.e2eSeen = "";
    const box = element.getBoundingClientRect();
    return {
      name:
        element.getAttribute("aria-label") ??
        element.textContent?.trim().slice(0, 40) ??
        element.tagName,
      seen,
      inBar:
        element.classList.contains("kn-skip") ||
        (top?.contains(element) ?? false) ||
        (bottom?.contains(element) ?? false),
      top: box.top,
      bottom: box.bottom,
      headerBottom: top?.getBoundingClientRect().bottom ?? 0,
      tabTop: bottom?.getBoundingClientRect().top ?? window.innerHeight,
    };
  });
}

test.describe("R1-02 dead links", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`R1-02 every link the shell draws on Today opens a page in the shell, never the bare 404, at ${viewport.width} px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await openToday(page);
      const hrefs = (await shellLinks(page)).filter((href) => href !== "/");
      // The tabs, Settings and the seven trust pages, at least.
      expect(hrefs.length).toBeGreaterThanOrEqual(10);
      // FIX-PRA's greybox /practice among them, since it merged.
      expect(hrefs).toContain("/practice");
      for (const href of hrefs) {
        // Direct load: a real page, never the not-found one.
        const response = await page.goto(href);
        expect(response?.status(), href).toBe(200);
        await expectPageInTheShell(page);
        await expect(
          page.getByRole("heading", { name: NOT_FOUND_HEADING }),
        ).toHaveCount(0);

        // And by the link itself, as a client navigation from Today.
        await openToday(page);
        await page
          .locator(`a[href="${href}"]`)
          .filter({ visible: true })
          .first()
          .click();
        await expect(page).toHaveURL(href);
        await expectPageInTheShell(page);
      }
    });
  }

  test("R1-02 an unknown address answers 404 with DESIGN §12.42's page, the tab bar and a focusable Go to Today", async ({
    page,
    consoleErrors,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    dropExpected(consoleErrors, NOT_FOUND_LOAD);
    await expect(page).toHaveTitle("Page not found · Knewt");
    // Kept out of search, once.
    await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
    ).toBeVisible();
    await expect(page.getByText("Even the newt can't find it.")).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Practice" }),
    ).toBeVisible();
    await expectPageInTheShell(page);
    // The page answers every unknown address, so it marks no tab.
    await expect(
      page.getByRole("navigation", { name: "Main" }).locator("[aria-current]"),
    ).toHaveCount(0);

    // The keyboard reaches Go to Today, and it goes home.
    const goToToday = page.getByRole("link", { name: "Go to Today" });
    for (let step = 0; step < 20; step += 1) {
      await page.keyboard.press("Tab");
      if (await goToToday.evaluate((link) => link === document.activeElement)) {
        break;
      }
    }
    await expect(goToToday).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/");
  });

  /** Beta shells, the not-found page while their flags are off. */
  const GROUP_NOT_FOUND = [
    { path: "/create/AB12CD34EF", group: "(tabs)", headers: 1 },
    {
      path: "/room/0f8fad5b-d9cb-469f-a165-70867728950e",
      group: "(play)",
      headers: 1,
    },
    { path: "/q/AB12CD34EF", group: "(landing)", headers: 1 },
    // The big screen's frame draws no header.
    {
      path: "/host/0f8fad5b-d9cb-469f-a165-70867728950e",
      group: "(host)",
      headers: 0,
    },
  ];

  for (const { path, group, headers } of GROUP_NOT_FOUND) {
    test(`R1-02 a notFound() inside the ${group} group shows the same page, in one frame`, async ({
      page,
      consoleErrors,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      dropExpected(consoleErrors, NOT_FOUND_LOAD);
      await expect(
        page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Go to Today" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => ({
          headers: [...document.querySelectorAll("header")].filter((header) =>
            header.checkVisibility(),
          ).length,
          mains: document.querySelectorAll("main").length,
          skipLinks: document.querySelectorAll(".kn-skip").length,
        })),
      ).toEqual({ headers, mains: 1, skipLinks: 1 });
      // The skip link's target is the page on screen.
      await expect(page.locator("main#main")).toBeVisible();
    });
  }

  test("R1-02 in the (host) group the not-found page wins over the big screen's size note, on a phone and in a short window", async ({
    page,
    consoleErrors,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 500 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto(
        "/host/0f8fad5b-d9cb-469f-a165-70867728950e",
      );
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByRole("link", { name: "Practice" }),
      ).toBeVisible();
      // "Open Knewt on your phone" is no answer to a phone on a dead link.
      await expect(
        page.getByText(/made for a TV or a big monitor/),
      ).toBeHidden();
    }
    dropExpected(consoleErrors, NOT_FOUND_LOAD);
  });

  // Next titles the page from the module that called notFound(), so the
  // Beta route modules (the editor, rooms and shared quizzes) export
  // NOT_FOUND_METADATA (@/features/shell) while their flag is off.
  test("R1-02 a notFound() inside a route group is titled Page not found, not Today's Knewt", async ({
    page,
    consoleErrors,
  }) => {
    for (const { path } of [
      ...GROUP_NOT_FOUND,
      { path: "/join/123456" },
      { path: "/q/AB12CD34EF/play" },
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      dropExpected(consoleErrors, NOT_FOUND_LOAD);
      await expect(page).toHaveTitle("Page not found · Knewt");
      // Next's noindex, once.
      await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
    }
  });

  test("R1-02 a trust page wears the same top bar as Today: the bar keeps the page's column, only the text narrows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    /** The shown top bar's row and the shown main, left and right. */
    const frame = () =>
      page.evaluate(() => {
        const shown = (selector: string) => {
          const element = [...document.querySelectorAll(selector)].find(
            (candidate) => candidate.checkVisibility(),
          );
          if (element === undefined) throw new Error(selector);
          const box = element.getBoundingClientRect();
          return [Math.round(box.left), Math.round(box.right)];
        };
        return {
          row: shown("header.kn-topbar .kn-topbar-row"),
          tabs: shown("header.kn-topbar nav[aria-label='Main']"),
          main: shown("main"),
        };
      });
    await openToday(page);
    const today = await frame();
    await page.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL("/privacy");
    const privacy = await frame();
    // Nothing in the bar moves when a footer link opens a trust page...
    expect(privacy.row).toEqual(today.row);
    expect(privacy.tabs).toEqual(today.tabs);
    // ...while the page's text keeps DESIGN §12.40's 640 px reading column.
    const [left = 0, right = 0] = privacy.main;
    expect(right - left).toBe(640);
  });

  test("R1-02 at 200% text a trust page's top bar fits its row from 768 px, as a tab page's does", async ({
    page,
  }) => {
    for (const width of [768, 1024]) {
      await page.setViewportSize({ width, height: 600 });
      for (const path of ["/privacy", "/g"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        const overflow = await page.evaluate(() => {
          const row = [
            ...document.querySelectorAll<HTMLElement>(".kn-topbar-row"),
          ].find((candidate) => candidate.checkVisibility());
          if (row === undefined) throw new Error("top bar row");
          return row.scrollWidth - row.clientWidth;
        });
        expect(overflow, `${path} at ${width} px`).toBeLessThanOrEqual(0);
      }
    }
  });

  test("R1-02 a dead link inside a page lands on the in-shell not-found page", async ({
    page,
    consoleErrors,
  }) => {
    await openToday(page);
    // Today's Daily card links to the archive until ARC-1 builds it (and
    // FIX-DLY hides the link meanwhile): either way, no bare 404.
    const pastWeek = page.getByRole("link", { name: "Past 7 days" });
    test.skip((await pastWeek.count()) === 0, "the link is hidden");
    await pastWeek.click();
    await expect(page).toHaveURL("/archive");
    await expect(
      page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
    ).toBeVisible();
    await expectPageInTheShell(page);
    dropExpected(consoleErrors, NOT_FOUND_LOAD);
  });
});

test.describe("R1-12 focus and the bars", () => {
  for (const { width, height, text } of [
    { width: 640, height: 400, text: "100%" },
    { width: 390, height: 844, text: "200%" },
    { width: 360, height: 640, text: "200%" },
  ]) {
    test(`R1-12 tabbing through Today keeps every focused box between the header and the tab bar, at ${width} by ${height} with ${text} text`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openToday(page);
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, text);
      const hidden: string[] = [];
      let sawPlay = false;
      for (let step = 0; step < 60; step += 1) {
        await page.keyboard.press("Tab");
        const focus = await focusAndBars(page);
        if (focus === null || focus.seen) break;
        if (focus.name === "Play today's Daily") sawPlay = true;
        if (focus.inBar) continue;
        // Its whole box, with room for the 3 px ring at its 3 px offset.
        if (
          focus.top < focus.headerBottom + 3 ||
          focus.bottom > focus.tabTop - 3
        ) {
          hidden.push(
            `${focus.name}: ${Math.round(focus.top)} to ${Math.round(focus.bottom)}, bars ${Math.round(focus.headerBottom)} and ${Math.round(focus.tabTop)}`,
          );
        }
      }
      expect(sawPlay).toBe(true);
      expect(hidden).toEqual([]);
    });
  }

  test("R1-12 the scroll padding is the bars' real height, at 200% text too", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openToday(page);
    for (const size of ["100%", "200%"]) {
      await page.evaluate((value) => {
        document.documentElement.style.fontSize = value;
      }, size);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const css = getComputedStyle(document.documentElement);
            const header = document.querySelector("header.kn-topbar");
            const tabs = document.querySelector("nav.kn-tabbar");
            return {
              top:
                Number.parseFloat(css.scrollPaddingTop) -
                Math.ceil(header?.getBoundingClientRect().height ?? 0),
              bottom:
                Number.parseFloat(css.scrollPaddingBottom) -
                Math.ceil(tabs?.getBoundingClientRect().height ?? 0),
            };
          }),
        )
        // The bar plus 8 px for the focus ring, on each edge.
        .toEqual({ top: 8, bottom: 8 });
    }
  });

  test("R1-12 in a practice run at 200% zoom, a focused option never sits under the play header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 400 });
    await startQuickPlay(page);
    const under: string[] = [];
    let checked = 0;
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Tab");
      const focus = await focusAndBars(page);
      if (focus === null || focus.seen) break;
      if (focus.inBar) continue;
      checked += 1;
      if (focus.top < focus.headerBottom + 3) {
        under.push(`${focus.name} at ${Math.round(focus.top)}`);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2);
    expect(under).toEqual([]);
  });
});

test.describe("R1-09 text from the page you just left", () => {
  test("R1-09 after the Daily, Today and a practice run, one #main is in the document, and it is on screen", async ({
    page,
  }) => {
    await page.goto("/daily");
    await expect(
      page.getByRole("button", { name: /^Next clue/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: /^Leave the Daily/ }).click();
    await expect(page).toHaveURL("/");
    await page
      .locator('[data-home-slot="practice"]')
      .getByRole("link", { name: "Quick play" })
      .click();
    await expect(page).toHaveURL("/practice/run");
    await expect(options(page).first()).toBeVisible();

    const mains = await page.evaluate(() =>
      [...document.querySelectorAll("#main")].map((main) =>
        main.checkVisibility(),
      ),
    );
    expect(mains).toEqual([true]);
    // Three routes are in the document, so the other mains are still there.
    expect(await page.locator("main").count()).toBeGreaterThan(1);

    // The skip link reaches the one on screen.
    const skip = page.getByRole("link", { name: "Skip to content" });
    await skip.focus();
    await page.keyboard.press("Enter");
    expect(
      await page.evaluate(() => {
        const focused = document.activeElement;
        return {
          id: focused?.id ?? "",
          shown: focused instanceof HTMLElement && focused.checkVisibility(),
        };
      }),
    ).toEqual({ id: "main", shown: true });
  });

  test("R1-09 a verdict announced in practice is gone from the status region once Today opens", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await options(page).first().click();
    await expect(politeRegion(page)).not.toBeEmpty();
    await page.getByRole("link", { name: /^Leave practice/ }).click();
    await expect(page).toHaveURL("/");
    await expect(politeRegion(page)).toBeEmpty();
    await expect(page.locator("#qz-live-assertive")).toBeEmpty();
  });

  test("R1-09 the route announcer reads each new page's own title, not its first words", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openToday(page);
    const tab = (name: string) =>
      page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name });

    // Every destination the shell draws prefetches, so its title is in
    // place when the announcer reads (it falls back to the first h1).
    await tab("Groups").click();
    await expect(page).toHaveURL("/g");
    await expect.poll(() => announcer(page)).toBe("Groups · Knewt");

    // FIX-PRA's greybox hub, prefetched since it merged.
    await tab("Practice").click();
    await expect(page).toHaveURL("/practice");
    await expect.poll(() => announcer(page)).toBe("Practice · Knewt");

    await tab("Me").click();
    await expect(page).toHaveURL("/me");
    await expect.poll(() => announcer(page)).toBe("Me · Knewt");

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL("/settings");
    await expect.poll(() => announcer(page)).toBe("Settings · Knewt");

    await tab("Today").click();
    await expect(page).toHaveURL("/");
    await expect.poll(() => announcer(page)).toBe("Knewt");

    await page.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL("/privacy");
    await expect.poll(() => announcer(page)).toBe("Privacy · Knewt");

    await tab("Today").click();
    await expect(page).toHaveURL("/");
    await page
      .locator('[data-home-slot="practice"]')
      .getByRole("link", { name: "Quick play" })
      .click();
    await expect(page).toHaveURL("/practice/run");
    // FIX-PRA's run title, apart from the hub's.
    await expect.poll(() => announcer(page)).toBe("Practice round · Knewt");
  });

  // The run screen prefetches /practice/results as the run starts, so the
  // page arrives with its title before the last question hands over.
  test("R1-09 after the last practice question, the route announcer reads the results page's title, not the question", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await startQuickPlay(page);
    for (let question = 1; question <= 10; question += 1) {
      await answerFirst(page);
      await page
        .getByRole("button", { name: /^(Next question|See your results)/ })
        .click();
      if (question < 10) {
        await expect(
          round(page).getByText(`Question ${question + 1} of 10`),
        ).toBeVisible();
      }
    }
    await expect(page).toHaveURL("/practice/results");
    await expect.poll(() => announcer(page)).toBe("Practice results · Knewt");
  });

  // The Daily screen prefetches its stop screen while it plays, so the
  // results arrive with their title before "See your results" hands over.
  test("R1-09 after the Encore, the route announcer reads the stop screen's title, not the Encore", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/daily");
    for (const next of ["Next mystery", "Next mystery", "On to the Encore"]) {
      await expect(
        page.getByRole("button", { name: /^Next clue/ }),
      ).toBeVisible();
      for (let clue = 1; clue < 4; clue += 1) {
        await page
          .getByRole("button", { name: /^(Next clue|Last clue)/ })
          .click();
      }
      await page.getByRole("button", { name: /^A\. / }).click();
      await page.getByRole("button", { name: next }).click();
    }
    await page.getByLabel(/your number/i).fill("1000");
    await page.getByRole("button", { name: "Lock in" }).click();
    await page.getByRole("button", { name: "See your results" }).click();
    await expect(page).toHaveURL(/\/daily\/\d+\/results$/);
    await expect.poll(() => announcer(page)).toBe("Your Daily results · Knewt");
  });

  // With no prefetch landed (slow 4G, or a press straight after Today
  // renders) the title arrives after the announcer reads, and Next falls
  // back to the first h1 in the document. The run screen's first render
  // holds one, a visually hidden "Practice round" until the question's
  // own, which comes before the hidden Today's greeting.
  test("R1-09 when Quick play is pressed before its prefetch lands, the route announcer never reads Today's greeting", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Every prefetch is held, never answered.
    await page.route("**/*", async (route) => {
      if (route.request().headers()["next-router-prefetch"] !== undefined) {
        return;
      }
      await route.continue();
    });
    await page.goto("/");
    const greeting = page.getByRole("heading", { level: 1 });
    await expect(greeting).toBeVisible();
    const words = (await greeting.textContent()) ?? "";
    await page
      .locator('[data-home-slot="practice"]')
      .getByRole("link", { name: "Quick play" })
      .click();
    await expect(page).toHaveURL("/practice/run");
    await expect(options(page).first()).toBeVisible();
    await expect.poll(() => announcer(page)).not.toBe("");
    expect(await announcer(page)).not.toBe(words);
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`R1-09 keyboard focus survives a footer link to another route group: the next Tab lands inside the new page, at ${viewport.width} px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openToday(page);
      const privacy = page.locator("footer").getByRole("link", {
        name: "Privacy",
      });
      // Keyboard only: Tab to the footer link, then Enter.
      for (let step = 0; step < 60; step += 1) {
        await page.keyboard.press("Tab");
        if (await privacy.evaluate((link) => link === document.activeElement)) {
          break;
        }
      }
      await expect(privacy).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL("/privacy");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Privacy",
      );
      // Focus never falls to the body, where the next Tab leaves the page.
      expect(
        await page.evaluate(() => document.activeElement === document.body),
      ).toBe(false);
      await page.keyboard.press("Tab");
      const landed = await page.evaluate(() => {
        const element = document.activeElement;
        const main = [...document.querySelectorAll("main")].find((candidate) =>
          candidate.checkVisibility(),
        );
        return {
          inMain:
            element !== null &&
            element !== main &&
            (main?.contains(element) ?? false),
          shown: element instanceof HTMLElement && element.checkVisibility(),
          name: element?.textContent?.trim() ?? "",
        };
      });
      expect(landed.inMain, landed.name).toBe(true);
      expect(landed.shown).toBe(true);
    });
  }
});

test.describe("R1-20 the brand", () => {
  test("R1-20 every tab, bookmark and link preview says Knewt", async ({
    page,
    consoleErrors,
  }) => {
    for (const [path, title] of [
      ["/", "Knewt"],
      ["/g", "Groups · Knewt"],
      ["/privacy", "Privacy · Knewt"],
      // FIX-PRA's run title, which reads apart from the hub's.
      ["/practice/run", "Practice round · Knewt"],
      ["/no-such-page", "Page not found · Knewt"],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(title);
      const meta = await page.evaluate(() => {
        const content = (selector: string) =>
          document.querySelector<HTMLMetaElement>(selector)?.content ?? null;
        return {
          description: content('meta[name="description"]'),
          siteName: content('meta[property="og:site_name"]'),
          ogTitle: content('meta[property="og:title"]'),
          ogDescription: content('meta[property="og:description"]'),
          card: content('meta[name="twitter:card"]'),
        };
      });
      expect(meta.description, path).toMatch(/^Knewt is a daily trivia game/);
      expect(meta.siteName, path).toBe("Knewt");
      expect(meta.ogTitle, path).toBe("Knewt");
      expect(meta.ogDescription, path).toBe(meta.description);
      expect(meta.card, path).toBe("summary");
      expect(await page.content()).not.toMatch(/quiz web app/i);
    }
    // /no-such-page answers 404, on purpose.
    dropExpected(consoleErrors, NOT_FOUND_LOAD);
  });
});

test.describe("R1-08 and R1-27 marks, not buttons", () => {
  test("R1-08 the Daily's pills are flat marks, and the current one wears a bar, not a ring", async ({
    page,
  }) => {
    await page.goto("/daily");
    const pills = page.locator('header ol[data-variant="pills"] > li');
    await expect(pills).toHaveCount(4);
    const looks = await pills.evaluateAll((steps) =>
      steps.map((step) => {
        const css = getComputedStyle(step);
        const after = getComputedStyle(step, "::after");
        return {
          role: step.getAttribute("role"),
          tabIndex: step.tabIndex,
          cursor: css.cursor,
          shadow: css.boxShadow,
          outline: css.outlineStyle,
          current: step.getAttribute("aria-current"),
          bar: after.content === "none" ? null : after.height,
        };
      }),
    );
    for (const look of looks) {
      expect(look.role).toBeNull();
      expect(look.tabIndex).toBe(-1);
      expect(look.cursor).toBe("default");
      expect(look.shadow).toBe("none");
      // Nothing that reads like the focus ring.
      expect(look.outline).toBe("none");
    }
    expect(looks.filter((look) => look.current === "step")).toHaveLength(1);
    expect(looks.find((look) => look.current === "step")?.bar).toBe("3px");
    expect(looks.filter((look) => look.bar !== null)).toHaveLength(1);
  });

  test("R1-27 the Mystery's worth scale is a mark: a flat disc, and 'points now' under the value it marks", async ({
    page,
  }) => {
    await page.goto("/daily");
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    /** The disc's shadow, and where the label sits against the current value. */
    const look = () =>
      page.locator("[data-stake]").evaluate((scale) => {
        const marker = scale.querySelector("[data-stake-marker]");
        const now = scale.querySelector('[data-state="now"]');
        const label = scale.parentElement?.querySelector("[data-stake-label]");
        if (!marker || !now || !label) return null;
        const value = now.getBoundingClientRect();
        const words = label.getBoundingClientRect();
        const centre = value.left + value.width / 2;
        return {
          worth: Number(scale.getAttribute("data-stake")),
          shadow: getComputedStyle(marker).boxShadow,
          under: words.top >= scale.getBoundingClientRect().bottom - 1,
          spans: words.left <= centre + 0.5 && centre - 0.5 <= words.right,
          inside:
            words.left >= scale.getBoundingClientRect().left - 0.5 &&
            words.right <= scale.getBoundingClientRect().right + 0.5,
        };
      });
    for (const worth of [4, 3, 2, 1]) {
      if (worth < 4) {
        await page
          .getByRole("button", { name: /^(Next clue|Last clue)/ })
          .click();
      }
      // Once the disc and the label have slid (320 ms).
      await expect.poll(look).toEqual({
        worth,
        shadow: "none",
        under: true,
        spans: true,
        inside: true,
      });
    }
  });

  test("R1-27 a chip and a stopwatch reading look like labels; only a chip that is a link looks like a control", async ({
    page,
  }) => {
    await openToday(page);
    // The markup `Chip`, `chipClasses({ interactive: true })` and `Stopwatch`
    // render (src/ui), set on the page so the real stylesheet styles it.
    const looks = await page.evaluate(() => {
      const holder = document.createElement("div");
      holder.innerHTML =
        '<span class="kn-chip" data-tone="default">History</span>' +
        '<span class="kn-chip" data-tone="sunken">Within 5% is a bullseye</span>' +
        '<a href="#" class="kn-chip kn-hit">Choose a category</a>' +
        '<p class="kn-watch">1:12</p>' +
        '<button type="button" class="kn-watch">1:12</button>';
      document.querySelector("main")?.append(holder);
      return [...holder.children].map((element) => {
        const css = getComputedStyle(element);
        return {
          radius: css.borderTopLeftRadius,
          border: css.borderTopWidth,
          cursor: css.cursor,
          shadow: css.boxShadow,
        };
      });
    });
    const [label, hint, link, reading, button] = looks;
    for (const flat of [label, hint, reading]) {
      expect(flat?.cursor).not.toBe("pointer");
      expect(flat?.shadow).toBe("none");
    }
    // A label is a tag with a small corner; a control is a pill.
    expect(label?.radius).toBe("6px");
    expect(hint?.radius).toBe("6px");
    expect(link?.radius).not.toBe("6px");
    expect(link?.cursor).toBe("pointer");
    // The stopwatch has an edge only as a button.
    expect(reading?.border).toBe("0px");
    // 1.5 px in the stylesheet, which Chromium snaps to whole device pixels.
    expect(button?.border).not.toBe("0px");
    expect(button?.cursor).toBe("pointer");
  });

  test("R1-27 practice's segments are flat marks too", async ({ page }) => {
    await startQuickPlay(page);
    const looks = await page
      .locator('header ol[data-variant="bar"] > li')
      .evaluateAll((steps) =>
        steps.map((step) => {
          const css = getComputedStyle(step);
          return {
            cursor: css.cursor,
            shadow: css.boxShadow,
            outline:
              css.outlineStyle === "none"
                ? "none"
                : `${css.outlineWidth} at ${css.outlineOffset}`,
          };
        }),
      );
    expect(looks).toHaveLength(10);
    for (const look of looks) {
      // Nothing that reads like the focus ring: an empty segment's 3:1 edge
      // (R2-28) is 1 px drawn inside it, never a ring outside.
      expect(look).toMatchObject({ cursor: "default", shadow: "none" });
      expect(["none", "1px at -1px"]).toContain(look.outline);
    }
  });

  // The Daily header renders `Stopwatch` from @/ui/stopwatch (time,
  // label, and onClick with the More menu's ARIA and ref).
  test("R1-27 the Daily's stopwatch is the design system's: no edge unless it is a button, and 36 px tall at 200% text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/daily");
    await expect(
      page.getByRole("button", { name: /^Next clue/ }),
    ).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const watch = page.locator("header [data-stopwatch]");
    await expect(watch).toHaveCount(1);
    const look = await watch.evaluate((element) => {
      const css = getComputedStyle(element);
      return {
        primitive: element.classList.contains("kn-watch"),
        button: element.tagName === "BUTTON",
        border: Number.parseFloat(css.borderTopWidth),
        cursor: css.cursor,
        height: element.getBoundingClientRect().height,
      };
    });
    expect(look.primitive).toBe(true);
    if (look.button) {
      expect(look.border).toBeGreaterThan(0);
      expect(look.cursor).toBe("pointer");
    } else {
      expect(look.border).toBe(0);
      expect(look.cursor).not.toBe("pointer");
    }
    expect(look.height).toBeLessThanOrEqual(36);
  });
});

test.describe("R1-03 the Daily header", () => {
  for (const { width, height, text } of [
    { width: 320, height: 640, text: "100%" },
    { width: 320, height: 640, text: "200%" },
    { width: 390, height: 844, text: "200%" },
  ]) {
    test(`R1-03 the Daily header never runs off the screen, at ${width} px with ${text} text`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/daily");
      await expect(
        page.getByRole("button", { name: /^Next clue/ }),
      ).toBeVisible();
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, text);
      const fit = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>(".kn-playbar-row");
        if (row === null) throw new Error("no play header");
        const box = row.getBoundingClientRect();
        const parts = [...row.querySelectorAll<HTMLElement>("*")]
          .filter((part) => part.checkVisibility())
          .filter((part) => !part.classList.contains("sr-only"))
          .filter((part) => {
            const rect = part.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .filter((part) => {
            const rect = part.getBoundingClientRect();
            return rect.left < box.left - 0.5 || rect.right > box.right + 0.5;
          })
          .map((part) => part.className || part.tagName);
        const steps = [
          ...row.querySelectorAll<HTMLElement>('ol[data-variant="pills"] > li'),
        ]
          .filter((step) => step.checkVisibility())
          .map((step) => step.getBoundingClientRect());
        const overlaps = steps.some(
          (step, index) =>
            index > 0 && step.left < (steps[index - 1]?.right ?? 0) - 0.5,
        );
        const header = row.closest("header");
        return {
          // The header alone: the clue card below it is FIX-MYS's.
          headerRight: header?.getBoundingClientRect().right ?? Infinity,
          header: (header?.scrollWidth ?? 0) - (header?.clientWidth ?? 0),
          client: document.documentElement.clientWidth,
          row: row.scrollWidth - row.clientWidth,
          outside: parts,
          overlaps,
          narrowest: Math.min(...steps.map((step) => step.width)),
        };
      });
      expect(fit.headerRight).toBeLessThanOrEqual(fit.client + 0.5);
      expect(fit.header).toBeLessThanOrEqual(0);
      expect(fit.row).toBeLessThanOrEqual(0);
      expect(fit.outside).toEqual([]);
      expect(fit.overlaps).toBe(false);
      // Pills that show keep room for "+3" and "M3".
      if (Number.isFinite(fit.narrowest)) {
        expect(fit.narrowest).toBeGreaterThanOrEqual(28);
      }
    });
  }
});

test.describe("R1-36, R1-13 and R1-40 answer options", () => {
  for (const width of [390, 1280]) {
    test(`R1-36 an option's name sits centred on its letter badge, idle and dimmed, at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await startQuickPlay(page);
      /** How far each option's text centre sits from its badge's, in px. */
      const offsets = () =>
        options(page).evaluateAll((buttons) =>
          buttons.map((button) => {
            const text = button.querySelector(".kn-answer-text");
            const badge = button.querySelector(".kn-answer-badge");
            if (text === null || badge === null) {
              throw new Error("option parts");
            }
            const centre = (box: DOMRect) => (box.top + box.bottom) / 2;
            return {
              state: button.getAttribute("data-state"),
              off: Math.abs(
                centre(text.getBoundingClientRect()) -
                  centre(badge.getBoundingClientRect()),
              ),
            };
          }),
        );
      for (const option of await offsets()) {
        expect(option.state).toBe("idle");
        expect(option.off).toBeLessThanOrEqual(1);
      }
      // After the reveal the dimmed ones, stretched to a 2 by 2 row or not.
      await answerFirst(page);
      const dimmed = (await offsets()).filter(
        (option) => option.state === "dimmed",
      );
      expect(dimmed.length).toBeGreaterThan(0);
      for (const option of dimmed) {
        expect(option.off).toBeLessThanOrEqual(1);
      }
    });

    test(`R1-36 a reveal never squeezes a name: its words sit beside a name that leaves room for them, else under it, and nothing below a short option moves more than 10 px, at ${width} px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      await startQuickPlay(page);
      /** Each option's place in the list, its name's lines and one-line width. */
      const measure = () =>
        options(page).evaluateAll((buttons) => {
          const list = buttons[0]?.closest("ol")?.getBoundingClientRect();
          return buttons.map((button) => {
            const text = button.querySelector(".kn-answer-text");
            const tag = button.querySelector(".kn-answer-tag");
            if (text === null) throw new Error("option text");
            const range = document.createRange();
            range.selectNodeContents(text);
            const lines = new Set(
              [...range.getClientRects()]
                .filter((rect) => rect.width > 1)
                .map((rect) => Math.round(rect.top)),
            ).size;
            const css = getComputedStyle(button);
            const box = button.getBoundingClientRect();
            const textBox = text.getBoundingClientRect();
            const tagBox = tag?.getBoundingClientRect() ?? null;
            return {
              state: button.getAttribute("data-state") ?? "",
              top: box.top - (list?.top ?? 0),
              lines,
              // The name's width on its one line (the whole box if it wraps).
              nameWidth: range.getBoundingClientRect().width,
              // The room beside the 36 px badge and its 12 px gap.
              room:
                box.width -
                Number.parseFloat(css.paddingLeft) -
                Number.parseFloat(css.paddingRight) -
                Number.parseFloat(css.borderLeftWidth) -
                Number.parseFloat(css.borderRightWidth) -
                48,
              tagWidth: tagBox?.width ?? 0,
              tagBeside:
                tagBox === null ? null : tagBox.top < textBox.bottom - 1,
              tagInside:
                tagBox === null ? null : tagBox.right <= box.right + 0.5,
            };
          });
        });

      let pinned = 0;
      for (let question = 1; question <= 8; question += 1) {
        await expect(
          round(page).getByText(`Question ${question} of 10`),
        ).toBeVisible();
        const count = await options(page).count();
        if (count === 4) {
          const before = await measure();
          await options(page).nth(1).click();
          await expect(
            round(page).locator('[data-state="correct"]'),
          ).toHaveCount(1);
          // The words have risen into place (DESIGN §7.3).
          await page.waitForFunction(() =>
            [...document.querySelectorAll("main .kn-answer-tag")].every((tag) =>
              tag
                .getAnimations()
                .every((animation) => animation.playState === "finished"),
            ),
          );
          const after = await measure();
          let allBeside = true;
          after.forEach((option, index) => {
            const idle = before[index];
            if (idle === undefined) throw new Error("option count");
            // Never squeezed onto more lines than it had.
            expect(option.lines, option.state).toBeLessThanOrEqual(idle.lines);
            if (option.tagBeside === null) return;
            expect(option.tagInside).toBe(true);
            // Beside exactly when the one-line name leaves room (DS-1's rule).
            const slack = option.room - (idle.nameWidth + 12 + option.tagWidth);
            if (idle.lines === 1 && Math.abs(slack) > 2) {
              expect(option.tagBeside, `${option.state} slack ${slack}`).toBe(
                slack > 0,
              );
            }
            if (!option.tagBeside) allBeside = false;
          });
          if (allBeside) {
            const correct = after.findIndex(
              (option) => option.state === "correct",
            );
            const correctTop = after[correct]?.top ?? 0;
            after.forEach((option, index) => {
              const idle = before[index];
              if (idle === undefined || option.top <= correctTop + 1) return;
              // DESIGN §7.1 rule 1: nothing but sheets travels over 10 px.
              expect(Math.abs(option.top - idle.top)).toBeLessThanOrEqual(10);
            });
            pinned += 1;
          }
          await round(page).getByRole("heading", { level: 1 }).click();
          await expect(round(page).getByRole("region")).toBeVisible();
        } else {
          await answerFirst(page);
        }
        await page
          .getByRole("button", { name: /^(Next question|See your results)/ })
          .click();
      }
      // Fixture names are short, so most reveals keep their words beside.
      expect(pinned).toBeGreaterThan(0);
    });
  }

  test("R1-13 each option shows one key hint, its badge's letter, even where keys apply", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await startQuickPlay(page);
    await expect(options(page)).toHaveCount(4);
    // No keycap beside the text (the hint used to show from 768 px).
    await expect(round(page).locator("kbd")).toHaveCount(0);
    const letters = await options(page).evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          getComputedStyle(
            button.querySelector(".kn-answer-badge") ?? button,
            "::before",
          ).content,
      ),
    );
    expect(letters).toEqual(['"A"', '"B"', '"C"', '"D"']);
  });

  test(
    "R1-40 the accessibility tree names every option with its letter once",
    { tag: "@cdp" },
    async ({ page }) => {
      await startQuickPlay(page);
      const cdp: CDPSession = await page.context().newCDPSession(page);
      await cdp.send("DOM.enable");
      await cdp.send("Accessibility.enable");
      /** The names Chromium computes for the round's option buttons. */
      const names = async () => {
        const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
        const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
          nodeId: root.nodeId,
          selector: '[data-round="choice"] [data-question] ol button',
        });
        const out: string[] = [];
        for (const nodeId of nodeIds) {
          const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
            nodeId,
            fetchRelatives: false,
          });
          out.push(String(nodes[0]?.name?.value ?? ""));
        }
        return out;
      };
      const idle = await names();
      expect(idle).toHaveLength(4);
      idle.forEach((name, index) => {
        const letter = "ABCD"[index] ?? "";
        expect(name).toMatch(new RegExp(`^${letter}\\. \\S`));
        expect(name).not.toMatch(new RegExp(`^${letter}\\W+${letter}\\.`));
      });

      // After the reveal, where a check or an X replaces the letter.
      await answerFirst(page);
      const revealed = await names();
      expect(revealed).toHaveLength(4);
      for (const name of revealed) {
        expect(name).toMatch(/^[A-D]\. \S/);
        expect(name).not.toMatch(/^([A-D])\W+\1\./);
      }
    },
  );

  test("R1-36 the practice progress row keeps the page's gutter on the right", async ({
    page,
  }) => {
    for (const width of [320, 390, 767]) {
      await page.setViewportSize({ width, height: 800 });
      await startQuickPlay(page);
      const edges = await page.evaluate(() => {
        const steps = [
          ...document.querySelectorAll<HTMLElement>(
            'header ol[data-variant="bar"] > li',
          ),
        ].filter((step) => step.checkVisibility());
        const row = [
          ...document.querySelectorAll<HTMLElement>("header .kn-playbar-row"),
        ].find((element) => element.checkVisibility());
        const width = document.documentElement.clientWidth;
        return {
          segments: steps.at(-1)?.getBoundingClientRect().right ?? 0,
          row: row?.getBoundingClientRect().right ?? 0,
          // DESIGN §4's gutter: clamp(16px, 5.2vw, 20px).
          gutter: Math.min(20, Math.max(16, width * 0.052)),
        };
      });
      // The last segment ends one page gutter inside the header's column.
      expect(Math.abs(edges.row - edges.gutter - edges.segments)).toBeLessThan(
        1,
      );
    }
  });

  test("R1-36 the explanation sheet shows no grab handle, since nothing drags it", async ({
    page,
  }) => {
    await startQuickPlay(page);
    await answerFirst(page);
    const sheet = page.locator('[data-sheet="inline"]');
    await expect(sheet).toBeVisible();
    await expect(
      sheet.locator("[data-sheet-grab], .kn-sheet-grab"),
    ).toHaveCount(0);
  });
});

test.describe("R1-35 Today", () => {
  /** Scrolls the window by `y` and checks it moved, so a later 0 means something. */
  async function scrolledTo(page: Page, y: number): Promise<void> {
    await page.evaluate((top) => {
      window.scrollTo(0, top);
    }, y);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
  }

  test("R1-35 Today opens at its top when you come back from a practice run or the Daily", async ({
    page,
  }) => {
    // Short and 200% text, so both play screens can scroll.
    await page.setViewportSize({ width: 390, height: 640 });
    await startQuickPlay(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await scrolledTo(page, 34);
    await page.getByRole("link", { name: /^Leave practice/ }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("[data-daily-card]")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page
      .getByRole("link", { name: /^(Play today's Daily|Continue)$/ })
      .click();
    await expect(page).toHaveURL("/daily");
    await expect(
      page.getByRole("button", { name: /^Next clue/ }),
    ).toBeVisible();
    await scrolledTo(page, 34);
    await page.getByRole("link", { name: /^Leave the Daily/ }).click();
    await expect(page).toHaveURL("/");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("R1-35 Today opens at its top from its tab, wherever the last visit left it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await openToday(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    // Down at the footer, then over to a trust page and back by the tab.
    const bottom = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    await scrolledTo(page, bottom);
    await page.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL("/privacy");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Today" })
      .click();
    await expect(page).toHaveURL("/");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  for (const width of [1024, 1280, 1440]) {
    test(`R1-35 from 1024 px Today is two columns, centred on the page, with Quick play on one line, at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await openToday(page);
      const layout = await page.evaluate(() => {
        const box = (selector: string) => {
          const element = document.querySelector(selector);
          if (element === null) throw new Error(selector);
          return element.getBoundingClientRect();
        };
        const daily = box('[data-home-slot="daily"]');
        const practice = box('[data-home-slot="practice"]');
        const sections = box("[data-home-sections]");
        return {
          sideBySide: practice.left >= daily.right,
          sameTop: Math.abs(practice.top - daily.top) < 1,
          dailyShare: daily.width / sections.width,
          margins: [
            sections.left,
            document.documentElement.clientWidth - sections.right,
          ],
        };
      });
      expect(layout.sideBySide).toBe(true);
      expect(layout.sameTop).toBe(true);
      // The 7/12 column of DESIGN §10.1, less its share of the gap.
      expect(layout.dailyShare).toBeGreaterThan(0.55);
      expect(layout.dailyShare).toBeLessThan(0.59);
      const [left = 0, right = 0] = layout.margins;
      expect(Math.abs(left - right)).toBeLessThan(2);

      // In the 5/12 column the card's text gives way, never the button's
      // label (DESIGN §6.1: labels never wrap).
      const label = await page
        .locator('[data-home-slot="practice"]')
        .getByRole("link", { name: "Quick play" })
        .evaluate((link) => {
          const range = document.createRange();
          range.selectNodeContents(link);
          return {
            lines: new Set(
              [...range.getClientRects()]
                .filter((rect) => rect.width > 1)
                .map((rect) => Math.round(rect.top)),
            ).size,
            height: link.getBoundingClientRect().height,
          };
        });
      expect(label.lines).toBe(1);
      // The small button's 44 px, not a two-line 48.
      expect(label.height).toBeLessThanOrEqual(44.5);
    });
  }

  test("R1-35 below 1024 px Today is one column", async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await openToday(page);
    const stacked = await page.evaluate(() => {
      const daily = document
        .querySelector('[data-home-slot="daily"]')
        ?.getBoundingClientRect();
      const practice = document
        .querySelector('[data-home-slot="practice"]')
        ?.getBoundingClientRect();
      return (practice?.top ?? 0) >= (daily?.bottom ?? Infinity);
    });
    expect(stacked).toBe(true);
  });

  test("R1-35 a newcomer reads what the Daily asks under the greeting; on the next visit it is gone before the first paint", async ({
    page,
    consoleErrors,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openToday(page);
    const line = page.getByText("Name the mystery in as few clues as you can.");
    await expect(line).toBeVisible();
    const order = await page.evaluate(() => {
      const heading = document.querySelector("h1");
      const text = [...document.querySelectorAll("p")].find(
        (paragraph) =>
          paragraph.textContent ===
          "Name the mystery in as few clues as you can.",
      );
      return heading !== null && text !== undefined
        ? Boolean(
            heading.compareDocumentPosition(text) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          )
        : false;
    });
    expect(order).toBe(true);

    // The first visit minted this device's identity: the next load knows it,
    // and the line is hidden before the page first paints. With every
    // script chunk blocked, only the inline pre-paint script can hide it.
    await page.route("**/_next/static/chunks/**", (route) => route.abort());
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(line).toBeHidden();
    await page.unroute("**/_next/static/chunks/**");
    dropExpected(consoleErrors, /Failed to load resource: net::ERR_FAILED/);

    // And hydration keeps it hidden.
    await openToday(page);
    await expect(line).toBeHidden();
  });

  test.describe("by the device's clock", () => {
    test.use({ timezoneId: "Australia/Melbourne" });

    test("R1-35 says Hello. from midnight to 4:59, then Good morning. (D18)", async ({
      page,
    }) => {
      await setClock(page, "2026-11-05T00:32:00", "Australia/Melbourne", {
        mode: "fixed",
      });
      await openToday(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Hello.",
      );
      await setClock(page, "2026-11-05T05:00:00", "Australia/Melbourne", {
        mode: "fixed",
      });
      await openToday(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Good morning.",
      );
    });

    test("R1-35 the dateline names the date once, above the greeting", async ({
      page,
    }) => {
      await setClock(page, "2026-11-05T09:00:00", "Australia/Melbourne", {
        mode: "fixed",
      });
      await openToday(page);
      const intro = page.locator("[data-home-intro]");
      await expect(intro).toContainText("Thursday 5 November");
      expect(
        (await intro.innerText()).split("Thursday 5 November").length - 1,
      ).toBe(1);
    });
  });
});

test.describe("R1-34 rings, headings and tab labels", () => {
  test("R1-34 every focus target gets the same 3 px ring at a 3 px offset, summary included", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openToday(page);
    // A disclosure, as practice results and the trust pages will use.
    await page.evaluate(() => {
      const details = document.createElement("details");
      details.innerHTML = "<summary>Why this answer?</summary><p>Because.</p>";
      document.querySelector("main")?.prepend(details);
    });
    const rings: { name: string; ring: string }[] = [];
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement) || element === document.body) {
          return null;
        }
        if (element.dataset.e2eRing !== undefined) return null;
        element.dataset.e2eRing = "";
        const css = getComputedStyle(element);
        return {
          name: element.tagName === "SUMMARY" ? "summary" : element.tagName,
          ring: `${css.outlineWidth} ${css.outlineStyle}`,
          offset: css.outlineOffset,
          inTabBar: element.closest(".kn-tabbar") !== null,
        };
      });
      if (focus === null) break;
      rings.push({
        name: focus.name,
        ring: `${focus.ring}${focus.inTabBar ? "" : ` ${focus.offset}`}`,
      });
    }
    expect(rings.map((ring) => ring.name)).toContain("summary");
    for (const ring of rings) {
      // The bottom tabs draw the same ring just inside, against the edge.
      expect(ring.ring, ring.name).toMatch(/^3px solid( 3px)?$/);
    }
  });

  for (const path of ["/", "/g", "/privacy", "/no-such-page"]) {
    test(`R1-34 at 200% text the h1 stays larger than every other heading on ${path}`, async ({
      page,
      consoleErrors,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      if (path === "/no-such-page") dropExpected(consoleErrors, NOT_FOUND_LOAD);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const sizes = await page.evaluate(() => {
        const size = (element: Element) =>
          Number.parseFloat(getComputedStyle(element).fontSize);
        const shown = (selector: string) =>
          [...document.querySelectorAll(selector)].filter((element) =>
            (element as HTMLElement).checkVisibility(),
          );
        return {
          h1: shown("h1").map(size),
          others: shown("h2, h3, h4").map(size),
        };
      });
      expect(sizes.h1).toHaveLength(1);
      for (const other of sizes.others) {
        expect(sizes.h1[0]).toBeGreaterThan(other);
      }
    });
  }

  test("R1-34 at 320 px with 200% text no page the shell links runs sideways, /accessibility's display title included", async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 320, height: 640 });
    await openToday(page);
    const hrefs = await shellLinks(page);
    expect(hrefs).toContain("/accessibility");
    expect(hrefs).toContain("/practice");
    for (const path of [...hrefs, "/no-such-page"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }
    dropExpected(consoleErrors, NOT_FOUND_LOAD);
  });

  test("R1-34 with WCAG 1.4.12's text spacing at 200% text, /accessibility never runs sideways", async ({
    page,
  }) => {
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 640 });
      await page.goto("/accessibility");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
        const spacing = document.createElement("style");
        spacing.textContent =
          "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";
        document.head.append(spacing);
      });
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  test("R1-34 at 200% text the tab labels stay at least 12 px apart", async ({
    page,
  }) => {
    for (const width of [320, 390, 767]) {
      await page.setViewportSize({ width, height: 844 });
      await openToday(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const gaps = await page
        .locator(".kn-tabbar .kn-tab")
        .evaluateAll((tabs) => {
          const boxes = tabs.map((tab) => {
            const range = document.createRange();
            range.selectNodeContents(tab.lastChild ?? tab);
            return range.getBoundingClientRect();
          });
          return boxes
            .slice(1)
            .map((box, index) => box.left - (boxes[index]?.right ?? 0));
        });
      expect(gaps).toHaveLength(3);
      for (const gap of gaps) {
        expect(gap, `at ${width} px`).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
