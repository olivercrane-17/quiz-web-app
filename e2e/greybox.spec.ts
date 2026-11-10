/**
 * The playable greybox (ARCHITECTURE §12.2).
 *
 * Wave 0 checks the shell: Home renders with its four destinations, its
 * greeting and its skip link. The Wave 1 exit flows below run on the three
 * Wave 1 lanes together: PRA-1 (the choice plugin, ChoiceRound and Quick
 * play), MYS-1 (the mystery and encore plugins and rounds) and DLY-1 (the
 * sealed Daily on the mock backend). They play by Next clue and the clue-4
 * options; the typed guess, the AC-DLY-09 compositions and the home card's
 * states live in e2e/daily/greybox.spec.ts.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { setClock } from "./support/clock";

test.describe("the greybox shell", () => {
  test("Home shows the four tab-bar destinations by name", async ({ page }) => {
    await page.goto("/");

    // One bar per width: the bottom bar on phones, the top bar from 768 px.
    const bar = page.getByRole("navigation", { name: "Main" });
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeVisible();
    const links = bar.getByRole("link");
    await expect(links).toHaveText(["Today", "Practice", "Groups", "Me"]);
    for (const [name, href] of [
      ["Today", "/"],
      ["Practice", "/practice"],
      ["Groups", "/g"],
      ["Me", "/me"],
    ] as const) {
      await expect(
        bar.getByRole("link", { name, exact: true }),
      ).toHaveAttribute("href", href);
    }
    await expect(bar.getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(bar.locator("[aria-current]")).toHaveCount(1);
  });

  test("Skip to content comes first and lands on the main content", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "keyboard focus order is checked in Chromium",
    );
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("Skip to content still lands on the page shown after a move between route groups", async ({
    page,
  }) => {
    // Next keeps the previous route mounted but hidden, with its own <main>.
    await page.goto("/shell/claim");
    await page.getByRole("link", { name: "Knewt" }).click();
    await expect(page).toHaveURL("/");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await skip.focus();
    await page.keyboard.press("Enter");
    const main = page.getByRole("main");
    await expect(main).toBeFocused();
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test.describe("the greeting", () => {
    test.use({ timezoneId: "Europe/London" });

    test("follows the device clock from the first paint, with no hydration error", async ({
      page,
    }) => {
      // 08:30 in London on Sunday 1 November 2026 (GMT, UTC+0).
      await page.clock.setFixedTime(new Date("2026-11-01T08:30:00Z"));
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Good morning.",
      );
      // Exact: the Daily card's "Daily #42 · Sunday 1 November" names it too.
      await expect(
        page.getByText("Sunday 1 November", { exact: true }),
      ).toBeVisible();
      // Any hydration mismatch would surface as a console error here.
      await page.waitForLoadState("networkidle");
    });

    test("is filled on a client navigation to Home as well", async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date("2026-11-01T19:05:00Z"));
      await page.goto("/shell/claim");
      await page.getByRole("link", { name: "Knewt" }).click();
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Good evening.",
      );
    });
  });
});

test.describe("Wave 1 exit", () => {
  test.use({ timezoneId: "Europe/London" });

  test.beforeEach(async ({ page }) => {
    // Sunday 1 November 2026: Daily #42, spare set 6. Mysteries: a person
    // (Odile Marsh), a country (Valdoria), an element (Bismuth); the
    // Encore is 86.4 metres.
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
  });

  /** Next clue to the last clue, then the option named `option`. */
  async function toOptionsAndPick(page: Page, option: RegExp) {
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    await page.getByRole("button", { name: option }).click();
  }

  test("Quick play from Home runs ten questions to the results screen", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Quick play" }).click();
    await expect(page).toHaveURL("/practice/run");
    for (let question = 1; question <= 10; question += 1) {
      await page.getByRole("main").getByRole("button").first().click();
      await page
        .getByRole("button", {
          name: /^(Next question|See your results|Continue)/,
        })
        .click();
    }
    await expect(page).toHaveURL("/practice/results");
    await expect(
      page
        .getByRole("link", { name: "Play again" })
        .or(page.getByRole("button", { name: "Play again" })),
    ).toBeVisible();
  });

  test("AC-DLY-01 one tap on Play opens Mystery 1's first clue with nothing in between", async ({
    page,
  }) => {
    await page.goto("/");
    // Hydration replaces the history entry for "/" once, after goto
    // resolves. The card's chips come from get_today, which only runs once
    // the page has hydrated, so from then on only the tap navigates.
    await expect(page.locator("[data-daily-card] li").first()).toHaveText(
      "A person · Easy",
    );
    const urls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) urls.push(new URL(frame.url()).pathname);
    });
    await page.getByRole("link", { name: "Play today's Daily" }).click();
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await expect(page).toHaveURL("/daily");
    expect(urls).toEqual(["/daily"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("form")).toHaveCount(0);
  });

  test("a fixture Daily of three Mysteries and an Encore reaches the stop screen with its share lines in order", async ({
    page,
  }) => {
    await page.goto("/daily");
    await toOptionsAndPick(page, /Odile Marsh/);
    await page.getByRole("button", { name: "Next mystery" }).click();
    await toOptionsAndPick(page, /Ostravia/);
    await page.getByRole("button", { name: "Next mystery" }).click();
    await toOptionsAndPick(page, /Bismuth/);
    await page.getByRole("button", { name: "On to the Encore" }).click();
    await page.getByLabel(/your number/i).fill("90");
    await page.getByRole("button", { name: "Lock in" }).click();
    await page.getByRole("button", { name: "See your results" }).click();

    await expect(page).toHaveURL("/daily/42/results");
    await expect(page.locator("[data-score]")).toHaveText("2/12");
    const text = (
      await page.locator("[data-share-text]").inputValue()
    ).replaceAll("\u00a0", " ");
    expect(text.split("\n")).toEqual([
      "Knewt Daily #42 · 2/12 · Encore off by 4% 🎯",
      "History 🟧🟧🟧✅",
      // A miss ends in the missed mark since round 2 (D22, R2-09).
      "Geography 🟧🟧🟧❌",
      "Science & Tech 🟧🟧🟧✅",
      // The link opens Today until SHR-1's landing exists (R2-20).
      expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/$/),
    ]);
    await expect(
      page.getByRole("link", { name: "Done for today" }),
    ).toHaveAttribute("href", "/");
    await expect(page.getByText("Next Daily in 15h 0m")).toBeVisible();
  });

  test("AC-DLY-07 reloading mid-Mystery resumes at the same clue with the same guess chips", async ({
    page,
  }) => {
    // Mystery 1 solved on clue 2; Mystery 2 open on clue 2 after one wrong guess.
    await page.addInitScript(() => {
      (window as unknown as { __QZ_MOCK_INIT__: unknown }).__QZ_MOCK_INIT__ = {
        scenario: "in_progress_mystery_2",
      };
    });
    await page.goto("/daily");
    const round = page.locator("[data-round-area]");
    // MysteryRound's own position line: "Mystery 2 of 3", then its difficulty.
    await expect(round.getByText(/^Mystery 2 of 3/)).toBeVisible();
    await expect(round.getByRole("heading", { name: /clue 2/i })).toBeVisible();
    await expect(round.getByText(/Not Ostravia/)).toHaveCount(1);
    const actions = () =>
      page.evaluate(() => {
        const mock = (
          window as unknown as {
            __qzMock: {
              inspect(path: string): Record<string, { actions: number }>;
            };
          }
        ).__qzMock;
        return Object.values(mock.inspect("attempts")).map(
          (attempt) => attempt.actions,
        );
      });
    const before = await actions();

    await page.reload();
    await expect(round.getByText(/^Mystery 2 of 3/)).toBeVisible();
    await expect(round.getByRole("heading", { name: /clue 2/i })).toBeVisible();
    await expect(round.getByRole("heading", { name: /clue 3/i })).toHaveCount(
      0,
    );
    await expect(round.getByText(/Not Ostravia/)).toHaveCount(1);
    expect(await actions()).toEqual(before);
  });
});

/** RITE round 1's fixes that need a whole Daily, or a clock that moves. */
test.describe("RITE round 1 across the whole Daily", () => {
  test.use({ timezoneId: "Europe/London" });

  /** Next clue to the last clue, then the option named `option`. */
  async function toOptionsAndPick(page: Page, option: RegExp) {
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    await page.getByRole("button", { name: option }).click();
  }

  test("R1-06 the stopwatch picks up after a reload: 90 s on Mystery 1, 30 s on Mystery 2, then 2:00", async ({
    page,
  }) => {
    // A clock that runs, so the mock server and the page move together.
    await setClock(page, "2026-11-01T09:00:00", "Europe/London");
    await page.goto("/daily");
    const round = page.locator("[data-round-area]");
    await expect(round.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await page.clock.fastForward(90_000);
    // Mystery 1 solved on clue 1 by a typed guess: Odile Marsh.
    await round.getByRole("combobox").fill("Odile");
    await page.getByRole("option", { name: /Odile Marsh/ }).click();
    await round.getByRole("button", { name: "Guess", exact: true }).click();
    await page.getByRole("button", { name: "Next mystery" }).click();
    await expect(round.getByText(/^Mystery 2 of 3/)).toBeVisible();
    await expect(round.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await page.clock.fastForward(30_000);
    // DS-1's stopwatch reads "Time so far" to screen readers before the time.
    const watch = page.locator("[data-stopwatch]");
    await expect(watch).toHaveText(/\b2:0[0-2]$/);

    await page.reload();
    await expect(round.getByText(/^Mystery 2 of 3/)).toBeVisible();
    // Not 0:00: the server's figure for both rounds came back with the page.
    await expect(watch).toHaveText(/\b2:0[0-3]$/);
  });

  test("R1-34 every screen of the Daily has one h1, and the results open on their heading", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily");
    const visibleH1 = page.locator("h1:visible");
    for (const [answer, next] of [
      [/Odile Marsh/, "Next mystery"],
      [/Ostravia/, "Next mystery"],
      [/Bismuth/, "On to the Encore"],
    ] as const) {
      await expect(
        page.getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await expect(visibleH1).toHaveCount(1);
      await toOptionsAndPick(page, answer);
      // The reveal's heading is the h1 now.
      await expect(visibleH1).toHaveCount(1);
      await page.getByRole("button", { name: next }).click();
    }
    await page.getByLabel(/your number/i).fill("90");
    await expect(visibleH1).toHaveCount(1);
    await page.getByRole("button", { name: "Lock in" }).click();
    await page.getByRole("button", { name: "See your results" }).click();
    await expect(page).toHaveURL("/daily/42/results");
    const heading = page.getByRole("heading", { level: 1, name: "Daily #42" });
    await expect(heading).toBeFocused();
    await expect(visibleH1).toHaveCount(1);
  });
});
