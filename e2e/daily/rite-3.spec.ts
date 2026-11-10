/**
 * RITE round 3's Daily fixes (docs/playtests/rite-3.md §6 and §7, decisions
 * memo §26), each test named for its finding: one clock from the header to
 * the stop screen (R3-01), Today's "no time limit" (R3-02, D27), the fair
 * fixture Daily round 4 plays (R3-04) and help pages that promise only
 * what exists (R3-06).
 *
 * R3-01's tests run on a real clock. Its date is moved to Tuesday 10
 * November 2026, Daily #51 (round 3's Daily, and set A, which round 4
 * plays: The Lantern Keeper, cobalt and Arvenna, then Lake Ostry), by an
 * offset on `Date` alone: time passes at its own pace, and the page's
 * timers, its stopwatch and the mock server's latency are the browser's
 * own. Round 2's test fast-forwarded a mocked clock in whole steps, which
 * is how it missed a jump players saw every time.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { localInstant } from "../support/clock";
import { mockControls, mockInit } from "../support/mock";
import { chooseOption, pickOption } from "./clue-4";
import { readAndPress, stopwatchText } from "./stopwatch";

test.use({ timezoneId: "Europe/London" });

const LONDON = "Europe/London";
/** 09:00 in London on Tuesday 10 November 2026: Daily #51. */
const NOV_10 = "2026-11-10T09:00:00";

/** The round area: the open Mystery, the Encore or a reveal. */
const round = (page: Page) => page.locator("[data-round-area]");

/**
 * Moves the page's calendar to `local` in `zone` while its clock keeps
 * running at real speed: `Date` gains a fixed offset, and nothing else
 * changes (no fake timers). The offset is worked out once, here, so every
 * load of the page (a reload included) sees one continuous clock.
 */
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

/** Next clue to the last clue, then the clue-4 option named `name`. */
async function toOptionsAndPick(page: Page, name: RegExp): Promise<void> {
  for (let clue = 1; clue < 4; clue += 1) {
    await page.getByRole("button", { name: /^(Next clue|Last clue)/ }).click();
  }
  await pickOption(page, name);
}

const SET_A = [
  [/The Lantern Keeper/, "Next mystery"],
  [/Cobalt/, "Next mystery"],
  [/Arvenna/, "On to the Encore"],
] as const;

/**
 * Plays #51's three Mysteries on Next clue and their right options, a
 * little over a second on each clue so every round ends mid-second, then
 * opens the Encore. `midMystery2` runs on Mystery 2's clue 2.
 */
async function toTheEncore(
  page: Page,
  midMystery2?: () => Promise<void>,
): Promise<void> {
  for (const [index, [answer, next]] of SET_A.entries()) {
    await expect(
      round(page).getByRole("heading", { name: /clue 1/i }),
    ).toBeVisible();
    await page.waitForTimeout(1_300);
    if (index === 1 && midMystery2 !== undefined) {
      await page.getByRole("button", { name: /^Next clue/ }).click();
      await expect(
        round(page).getByRole("heading", { name: /clue 2/i }),
      ).toBeVisible();
      await midMystery2();
      await expect(
        round(page).getByRole("heading", { name: /clue 2/i }),
      ).toBeVisible();
      await page.getByRole("button", { name: /^Next clue/ }).click();
      await page.getByRole("button", { name: /^Last clue/ }).click();
      await pickOption(page, answer);
    } else {
      await toOptionsAndPick(page, answer);
    }
    await page.getByRole("button", { name: next }).click();
  }
  await expect(page.getByLabel(/your number/i)).toBeVisible();
}

/**
 * Locks in on the Encore with the stopwatch read at the press, holds the
 * header on that reading through the reveal, and finds it on the stop
 * screen: R3-01's whole check.
 */
async function lockInMatchesStopScreen(page: Page): Promise<void> {
  // A little over 2 s on the Encore, so it too ends mid-second.
  await page.waitForTimeout(1_200);
  await page.getByLabel(/your number/i).fill("90");
  const reading = await readAndPress(page, "Lock in");
  await expect(
    page.getByRole("button", { name: "See your results" }),
  ).toBeVisible();
  // The header stopped at the press, and stays there through the reveal.
  expect(await stopwatchText(page)).toBe(reading);
  await page.waitForTimeout(1_500);
  expect(await stopwatchText(page)).toBe(reading);
  await page.getByRole("button", { name: "See your results" }).click();
  await expect(page).toHaveURL("/daily/51/results");
  await expect(page.locator("[data-time]")).toHaveText(
    `Time ${reading} · only breaks ties`,
  );
}

test.describe("R3-01 one clock: the header at Lock in is the stop screen's time", () => {
  test.beforeEach(async ({ page }) => {
    await realClockAt(page, NOV_10, LONDON);
  });

  test("R3-01 on a real clock at the mock's default latency, the reading at Lock in is the stop screen's time", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/daily");
    await toTheEncore(page);
    await lockInMatchesStopScreen(page);
  });

  test("R3-01 with a reload in Mystery 2, the reading at Lock in is still the stop screen's time", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/daily");
    await toTheEncore(page, async () => {
      const seconds = (text: string) => {
        const [m = 0, s = 0] = text.split(":").map(Number);
        return m * 60 + s;
      };
      const before = seconds(await stopwatchText(page));
      await page.reload();
      await expect(
        round(page).getByRole("heading", { name: /clue 2/i }),
      ).toBeVisible();
      // The reload picks the round up where it stood, never behind it.
      expect(seconds(await stopwatchText(page))).toBeGreaterThanOrEqual(before);
    });
    await lockInMatchesStopScreen(page);
  });

  test("R3-01 a judge retried after a lost send records the press: the reveal and the stop screen show the reading", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/daily");
    await expect(
      round(page).getByRole("heading", { name: /clue 1/i }),
    ).toBeVisible();
    await page.waitForTimeout(1_300);
    // Three clues asked for: five requests at the pick, so 2 s of latency
    // allowance, as long as the transport retry's wait.
    for (const name of [/^Next clue/, /^Next clue/, /^Last clue/]) {
      await page.getByRole("button", { name }).click();
    }
    await expect(page.locator("[data-options]")).toBeVisible();
    // The pick's first send never reaches the server; the retry goes 2 s on.
    await mockControls(page).failNext("sealed.act", "unreachable", {
      times: 1,
    });
    // D31: the option is chosen first; Lock in is the press that sends it.
    await chooseOption(page, "The Lantern Keeper");
    const reading = await readAndPress(page, "Lock in The Lantern Keeper", {
      contains: true,
    });
    await expect(
      page.getByRole("button", { name: "Next mystery" }),
    ).toBeVisible({ timeout: 10_000 });
    // Round 4 review: the retry claimed its own moment, 2 s on, and the
    // reveal stepped up by it. It claims the press now.
    expect(await stopwatchText(page)).toBe(reading);
    await page.getByRole("button", { name: "Next mystery" }).click();
    for (const [answer, next] of SET_A.slice(1)) {
      await expect(
        round(page).getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await toOptionsAndPick(page, answer);
      await page.getByRole("button", { name: next }).click();
    }
    await expect(page.getByLabel(/your number/i)).toBeVisible();
    await lockInMatchesStopScreen(page);
  });

  test("R3-01 with 300 ms of mock latency, inside the allowance, the reading at Lock in is still the stop screen's time", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await mockInit(page, { latencyMs: 300 });
    await page.goto("/daily");
    await toTheEncore(page);
    await lockInMatchesStopScreen(page);
  });
});

test.describe("R3-02 Today's ticket (D27)", () => {
  test("R3-02 the Daily card says About 4 minutes · no time limit, and never untimed", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-11-10T09:00:00Z"));
    await page.goto("/");
    const card = page.locator("[data-daily-card]");
    await expect(card).toContainText("About 4 minutes · no time limit");
    await expect(card).not.toContainText(/untimed/i);
  });
});

test.describe("R3-04 the fixture Daily round 4 plays", () => {
  test("R3-04 Mystery 1's answer isn't the one match for keeper, and Arvenna's options all begin and end with A", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.clock.setFixedTime(new Date("2026-11-10T09:00:00Z"));
    await page.goto("/daily");
    const field = round(page).getByRole("combobox");
    await expect(field).toBeVisible();
    await field.click();
    await field.fill("keeper");
    // Four Keepers, so typing the job never lists the answer alone.
    await expect(page.getByRole("option")).toHaveCount(4);
    await field.fill("");
    await toOptionsAndPick(page, /The Lantern Keeper/);
    await page.getByRole("button", { name: "Next mystery" }).click();
    await toOptionsAndPick(page, /Cobalt/);
    await page.getByRole("button", { name: "Next mystery" }).click();
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    for (const name of ["Arvenna", "Araeria", "Aldessa", "Amorra"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
  });
});

test.describe("R3-06 the help pages promise only what exists", () => {
  /** A page's main text, as the reader sees it. */
  const mainText = async (page: Page, path: string) => {
    await page.goto(path);
    return (await page.locator("main").innerText()).replace(/\s+/g, " ");
  };

  test("R3-06 How scoring works promises no player count, and marks “so far today” coming later", async ({
    page,
  }) => {
    const text = await mainText(page, "/how-scoring-works");
    expect(text).not.toContain("how many have played");
    expect(text).not.toContain("you still see your own percentile");
    expect(text).toContain("“So far today” (coming later)");
  });

  test("R3-06 the accessibility statement lists no Settings that aren't built, and no Reduce motion in the More menu", async ({
    page,
  }) => {
    const text = await mainText(page, "/accessibility");
    expect(text).not.toContain("Settings that help");
    expect(text).not.toContain("More menu during a game");
    expect(text).not.toContain("Sound effects");
    expect(text).toContain("Choices you can make");
  });

  test("R3-06 the Terms mark quiz-making, rooms and deleting from Settings as coming later", async ({
    page,
  }) => {
    const text = await mainText(page, "/terms");
    expect(text).toContain("Quizzes you make (coming later)");
    expect(text).toContain("Both are coming later.");
    expect(text).toContain("Deleting your data from Settings is coming later.");
    expect(text).toContain(
      "Sharing a quiz you made, or hosting one in a room, needs you to be 18 or older.",
    );
  });

  test("R3-06 the privacy page marks downloading and deleting from Settings as coming later", async ({
    page,
  }) => {
    const text = await mainText(page, "/privacy");
    expect(text).toContain(
      "Downloading and deleting your data from Settings is coming later.",
    );
    expect(text).toContain("Taking or deleting your data (coming later)");
    expect(text).not.toContain("at any time in Settings");
    expect(text).not.toContain("Settings has two buttons");
  });
});
