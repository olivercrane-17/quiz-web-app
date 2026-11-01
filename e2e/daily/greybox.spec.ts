/**
 * The Daily greybox on the mock backend (ARCHITECTURE §12.3 DLY-1): Today's
 * card, the Daily screen's start states, the stop screen's routing, and the
 * fixture Dailies played through the real round plugins and components
 * (PRA-1's choice round, MYS-1's Mystery and Encore). The typed-guess spec
 * gets its suggestions from MYS-1's answer lists, which the Daily reads
 * through src/features/daily/screen/answer-lists.ts. The engine-level halves
 * of AC-DLY-01, 07 and 09 also run in Vitest with the echo plugins
 * (src/features/daily/model/controller.test.ts,
 * src/backend/mock/server/sealed.test.ts, src/engine/share/text.test.ts).
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

/** 09:00 in London on Sunday 1 November 2026: Daily #42 (spare set 6). */
const NOV_1 = new Date("2026-11-01T09:00:00Z");

type MockInit = Record<string, unknown>;

/** Sets `window.__QZ_MOCK_INIT__` before the app loads (§11.4). */
async function mockInit(page: Page, init: MockInit): Promise<void> {
  await page.addInitScript((value) => {
    (window as unknown as { __QZ_MOCK_INIT__: unknown }).__QZ_MOCK_INIT__ =
      value;
  }, init);
}

/** A choice or clue-4 option by its label: AnswerButton names it "A. Label". */
function option(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByRole("button", {
    name: new RegExp(`^[A-H]\\. ${escaped}$`),
  });
}

/** Reads the mock's database (`window.__qzMock.inspect`), once the backend has loaded. */
async function inspect<T>(page: Page, path: string): Promise<T> {
  await page.waitForFunction(() => "__qzMock" in window);
  return page.evaluate(
    (at) =>
      (
        window as unknown as { __qzMock: { inspect(path: string): unknown } }
      ).__qzMock.inspect(at),
    path,
  ) as Promise<T>;
}

test.use({ timezoneId: "Europe/London" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOV_1);
});

test.describe("Today's Daily card", () => {
  test("shows today's number, date and minutes at once, then one chip per round from get_today", async ({
    page,
  }) => {
    await page.goto("/");
    const card = page.locator("[data-daily-card]");
    await expect(
      card.getByRole("heading", { name: "Today's Daily" }),
    ).toBeVisible();
    await expect(card).toContainText(
      "Daily #42 · Sunday 1 November · About 4 minutes",
    );
    await expect(card).toContainText(
      "Fewer clues, more points. Then one number.",
    );
    await expect(
      card.getByRole("list", { name: "Today's rounds" }).getByRole("listitem"),
    ).toHaveText([
      "A person · Easy",
      "A country · Medium",
      "An element · Hard",
      "Encore · a number",
    ]);
    await expect(
      card.getByRole("link", { name: "Play today's Daily" }),
    ).toHaveAttribute("href", "/daily");
    await expect(
      card.getByRole("link", { name: "Past 7 days" }),
    ).toHaveAttribute("href", "/archive");
  });

  test("mints the guest identity on the device and registers nothing until a write (§9.1)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator('[data-daily-card="not_started"] li').first(),
    ).toHaveText("A person · Easy");
    const identity = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("qz:identity") ?? "null"),
    );
    expect(identity).toMatchObject({
      v: 1,
      registered: false,
      source: "minted",
    });
    expect(identity.playerId).toMatch(/^[0-9a-f-]{36}$/);
    // get_today never registers (§8.4).
    expect(await inspect(page, "players")).toBeUndefined();
  });
});

test.describe("the Daily screen's start states", () => {
  test("keeps trying when the server can't be reached, and says what still works", async ({
    page,
  }) => {
    await mockInit(page, {
      failures: [{ method: "sealed.start", code: "unreachable", times: 50 }],
    });
    await page.goto("/daily");
    const problem = page.locator('[data-daily-problem="unreachable"]');
    await expect(
      problem.getByRole("heading", {
        name: "We couldn't reach today's Daily.",
      }),
    ).toBeVisible();
    await expect(
      problem.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect(
      problem.getByRole("link", { name: "Play practice instead" }),
    ).toHaveAttribute("href", "/practice/run");
    // No Daily content renders behind it.
    await expect(page.locator("[data-round-area]")).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "Leave the Daily. Your progress is saved.",
      }),
    ).toHaveAttribute("href", "/");
  });

  test("says the Daily needs a connection when the device is offline", async ({
    page,
  }) => {
    await mockInit(page, {
      failures: [{ method: "sealed.start", code: "offline", times: 50 }],
    });
    await page.goto("/daily");
    await expect(
      page.locator('[data-daily-problem="offline"]').getByRole("heading", {
        name: "The Daily needs a connection.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Practice works offline, but it isn't today's Daily."),
    ).toBeVisible();
  });
});

test.describe("the stop screen's routing", () => {
  test("for today's Daily before it's finished, offers to play it", async ({
    page,
  }) => {
    await page.goto("/daily/42/results");
    await expect(
      page.getByText("You haven't finished today's Daily yet."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Play today's Daily" }),
    ).toHaveAttribute("href", "/daily");
  });

  test("for another date, points to the archive", async ({ page }) => {
    await page.goto("/daily/30/results");
    await expect(
      page.getByText("These results have moved to the archive."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Past 7 days" }),
    ).toHaveAttribute("href", "/archive");
  });

  test("for an address with no Daily number, says the page can't be found", async ({
    page,
  }) => {
    await page.goto("/daily/abc/results");
    await expect(page.getByText("We couldn't find that page.")).toBeVisible();
    // Exact: the close button is "Close the results and go to Today".
    await expect(
      page.getByRole("link", { name: "Go to Today", exact: true }),
    ).toHaveAttribute("href", "/");
    await expect(
      page.getByText("These results have moved to the archive."),
    ).toHaveCount(0);
  });
});

/** Wave 1 exit: the fixture Dailies on PRA-1's and MYS-1's plugins and round components. */
test.describe("playing the fixture Dailies (Wave 1 exit)", () => {
  /** Plays a Mystery on Next clue to its options, then picks the one matching `pattern`. */
  async function playMysteryToOptions(page: Page, pattern: RegExp) {
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    await page.getByRole("button", { name: pattern }).click();
  }

  test("a typed guess finds its suggestions, and a wrong one keeps the field and survives a reload", async ({
    page,
  }) => {
    // The suggestions come from MYS-1's person list (screen/answer-lists.ts).
    await page.goto("/daily");
    const round = page.locator("[data-round-area]");
    const field = round.getByRole("combobox");
    await field.fill("Cor");
    const suggestion = page.getByRole("option", { name: /Corin Ashby/ });
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await round.getByRole("button", { name: "Guess", exact: true }).click();
    await expect(round.getByText(/Not Corin Ashby/)).toBeVisible();
    await expect(round.getByRole("heading", { name: /clue 2/i })).toBeVisible();
    await expect(field).toBeFocused();
    const actions = () =>
      page.evaluate(() =>
        Object.values(
          (
            window as unknown as {
              __qzMock: {
                inspect(path: string): Record<string, { actions: number }>;
              };
            }
          ).__qzMock.inspect("attempts"),
        ).map((attempt) => attempt.actions),
      );
    expect(await actions()).toEqual([1]);
    await page.reload();
    await expect(round.getByText(/Not Corin Ashby/)).toHaveCount(1);
    expect(await actions()).toEqual([1]);
  });

  test("AC-DLY-09 [mc ×9, encore] renders, scores out of 9 and shares one row of nine choice glyphs", async ({
    page,
  }) => {
    // 15 November 2026: the [mc ×9, encore] fixture Daily (content/fixtures/schedule/2026-11.json).
    await page.clock.setFixedTime(new Date("2026-11-15T09:00:00Z"));
    const answers = [
      "The Tolle",
      "Hazel",
      "The Ringers' Guild",
      "A copper jar",
      "A goat-horn pipe",
      "Fish scales",
      "Ice skittles",
      "Mill ford",
      "The white stork",
    ];
    await page.goto("/daily");
    await expect(
      page.getByRole("list", { name: "Daily progress" }).getByRole("listitem"),
    ).toHaveCount(10);
    for (const [index, answer] of answers.entries()) {
      // ChoiceRound's position line ("Question 1 of 9 · Easy").
      await expect(
        page
          .locator("[data-round-area]")
          .getByText(new RegExp(`^Question ${index + 1} of 9`)),
      ).toBeVisible();
      await option(page, answer).click();
      await page
        .getByRole("button", {
          name: index < 8 ? "Next question" : "On to the Encore",
        })
        .click();
    }
    await page.getByLabel(/your number/i).fill("220");
    await page.getByRole("button", { name: "Lock in" }).click();
    await page.getByRole("button", { name: "See your results" }).click();
    await expect(page).toHaveURL("/daily/56/results");
    await expect(page.locator("[data-score]")).toHaveText("9/9");
    const lines = (await page.locator("[data-share-text]").innerText()).split(
      "\n",
    );
    expect(lines[0]).toMatch(/^Knewt Daily.#56 · 9\/9 · Encore/);
    expect(lines.slice(1, -1)).toEqual([`Questions ${"✅".repeat(9)}`]);
    expect(lines.at(-1)).toMatch(/\/daily$/);
  });

  test("AC-DLY-09 [mc ×5, mystery, encore] scores out of 9 and shares five choice glyphs, then a Mystery row", async ({
    page,
  }) => {
    // 16 November 2026: the [mc ×5, mystery, encore] fixture Daily.
    await page.clock.setFixedTime(new Date("2026-11-16T09:00:00Z"));
    await page.goto("/daily");
    for (const [index, answer] of [
      "Nella Sorrow",
      "Flour Day",
      "Beacon Knoll",
      "Heather ale",
      "1641",
    ].entries()) {
      await option(page, answer).click();
      await page
        .getByRole("button", {
          name: index < 4 ? "Next question" : "Next mystery",
        })
        .click();
    }
    await playMysteryToOptions(page, /The Lantern Keeper/);
    await page.getByRole("button", { name: "On to the Encore" }).click();
    await page.getByLabel(/your number/i).fill("1391");
    await page.getByRole("button", { name: "Lock in" }).click();
    await page.getByRole("button", { name: "See your results" }).click();
    await expect(page.locator("[data-score]")).toHaveText("6/9");
    const lines = (await page.locator("[data-share-text]").innerText()).split(
      "\n",
    );
    expect(lines.slice(1, -1)).toEqual([
      `Questions ${"✅".repeat(5)}`,
      "Film & TV 🟥🟥🟥✅",
    ]);
  });

  test("the home card follows the Daily: in progress, then finished with its grid", async ({
    page,
  }) => {
    await mockInit(page, { scenario: "in_progress_mystery_2" });
    await page.goto("/");
    const card = page.locator("[data-daily-card]");
    await expect(card.getByRole("heading")).toHaveText(
      "Continue Daily #42 · Mystery 2 of 3",
    );
    await expect(card.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/daily",
    );
    await page.evaluate(() =>
      (
        window as unknown as { __qzMock: { seed(s: string): Promise<void> } }
      ).__qzMock.seed("finished_today"),
    );
    await page.reload();
    await expect(card.getByRole("heading")).toHaveText("Done for today · 9/12");
    await expect(
      card.getByRole("link", { name: "See results" }),
    ).toHaveAttribute("href", "/daily/42/results");
    await expect(card).toContainText("Next Daily in 15h 0m");
  });
});
