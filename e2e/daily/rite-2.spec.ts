/**
 * RITE round 2's Daily fixes (docs/playtests/rite-2.md §5 and §6, decisions
 * memo §22), each test named for its finding: Leave's words and the
 * stopwatch they describe (R2-01, D19), one clue-4 order per player
 * (R2-03), the tiebreak order (R2-04, D21), E's pill (R2-06), one clock for
 * the header and the stop screen (R2-08), a miss's ❌ and the score card's
 * inset (R2-09, D22), Share under the card (R2-10), How to play on Today
 * (R2-18, D25), the chip rows (R2-19), the share link to
 * Today (R2-20) and "Close guess" (R2-24).
 *
 * Daily #42 (Sunday 1 November) and #46 (Thursday 5 November) share their
 * Mysteries: a person (Odile Marsh), a country (Valdoria) and an element
 * (bismuth). #42's Encore is 86.4 m; #46's, the 212 steps of the Harbour
 * Tower. No test here depends on the clue-4 order except R2-03's, which
 * pins the mock's seed and each player's identity to make it repeatable.
 */
import type { Browser, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { setClock } from "../support/clock";
import { mockInit } from "../support/mock";
import { pickOption } from "./clue-4";
import { readAndPress } from "./stopwatch";

test.use({ timezoneId: "Europe/London" });

/** 09:00 in London on Sunday 1 November 2026: Daily #42. */
const NOV_1 = "2026-11-01T09:00:00";
/** 09:00 in London on Thursday 5 November 2026: Daily #46, round 2's Daily. */
const NOV_5 = "2026-11-05T09:00:00";
const LONDON = "Europe/London";

const LEAVE_RUNNING =
  "Leave the Daily. Your progress is saved, and the stopwatch keeps running.";
const LEAVE_STOPPED = "Leave the Daily. Your progress is saved.";

/** The round area: the open Mystery, the Encore or a reveal. */
const round = (page: Page) => page.locator("[data-round-area]");
/** DS-1's stopwatch: "Time so far 1:12" to a screen reader, "1:12" to the eye. */
const stopwatch = (page: Page) => page.locator("[data-stopwatch]");

/** The stopwatch's reading in seconds. */
async function stopwatchSeconds(page: Page): Promise<number> {
  const text = (await stopwatch(page).textContent()) ?? "";
  const match = /(\d+):(\d\d)\s*$/.exec(text);
  if (match === null) throw new Error(`no time on the stopwatch: "${text}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The stopwatch's `m:ss`. */
async function stopwatchText(page: Page): Promise<string> {
  const text = (await stopwatch(page).textContent()) ?? "";
  const match = /(\d+:\d\d)\s*$/.exec(text);
  if (match === null) throw new Error(`no time on the stopwatch: "${text}"`);
  return match[1] ?? "";
}

/**
 * Types `query`, picks the suggestion named `name`, and guesses it. The
 * screen can move focus to the round's heading just after it shows, which
 * closes the list, so typing retries until the suggestion is there.
 */
async function guess(page: Page, query: string, name: RegExp): Promise<void> {
  const field = round(page).getByRole("combobox");
  const option = page.getByRole("option", { name });
  await expect(async () => {
    await field.click();
    await field.fill(query);
    await expect(option).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await option.click();
  await round(page).getByRole("button", { name: "Guess", exact: true }).click();
}

/** Next clue to the last clue, then the clue-4 option named `name`. */
async function toOptionsAndPick(page: Page, name: RegExp): Promise<void> {
  for (let clue = 1; clue < 4; clue += 1) {
    await page.getByRole("button", { name: /^(Next clue|Last clue)/ }).click();
  }
  await pickOption(page, name);
}

/** Plays #42's three Mysteries on Next clue and their right options, then opens the Encore. */
async function toTheEncore(page: Page): Promise<void> {
  for (const [answer, next] of [
    [/Odile Marsh/, "Next mystery"],
    [/Valdoria/, "Next mystery"],
    [/Bismuth/, "On to the Encore"],
  ] as const) {
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await toOptionsAndPick(page, answer);
    await page.getByRole("button", { name: next }).click();
  }
  await expect(page.getByLabel(/your number/i)).toBeVisible();
}

/** Locks in `value` on the Encore. */
async function lockIn(page: Page, value: string): Promise<void> {
  await page.getByLabel(/your number/i).fill(value);
  await page.getByRole("button", { name: "Lock in" }).click();
  await expect(
    page.getByRole("button", { name: "See your results" }),
  ).toBeVisible();
}

/** The mock database at `path` (`window.__qzMock.inspect`), once the backend has loaded. */
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

/** The analytics events the mock build recorded (`window.__qzTrackLog`). */
async function trackLog(
  page: Page,
): Promise<{ name: string; props: Record<string, unknown> }[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __qzTrackLog?: { name: string; props: Record<string, unknown> }[];
        }
      ).__qzTrackLog ?? [],
  );
}

/** The daily progress pills, M1 to E. */
const pills = (page: Page) =>
  page.getByRole("list", { name: "Daily progress" }).getByRole("listitem");

test.describe("R2-01 the stopwatch while away (D19)", () => {
  test("R2-01 leaving with a clue open says the stopwatch keeps running, and it does; leaving from a reveal says Saved, and it doesn't", async ({
    page,
  }) => {
    // A clock that runs, so the mock server and the page move together.
    await setClock(page, NOV_1, LONDON);
    await page.goto("/daily");
    await expect(
      round(page).getByRole("heading", { name: /clue 1/i }),
    ).toBeVisible();

    // Mystery 1, clue 1: the X and the toast say the clock runs on.
    await page.getByRole("link", { name: LEAVE_RUNNING, exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("[data-toast]")).toContainText("keeps running");
    const card = page.locator('[data-daily-card="in_progress"]');
    await expect(card).toContainText("Your stopwatch is still running.");

    // Two minutes on Today count: the clue was open all along.
    await page.clock.fastForward(120_000);
    await card.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL("/daily");
    await expect(
      round(page).getByRole("heading", { name: /clue 1/i }),
    ).toBeVisible();
    // The screen moves focus to the round's heading once it shows.
    await expect(round(page).getByRole("heading", { level: 1 })).toBeFocused();
    // The header shows what the round counts: two minutes away, less the
    // 400 ms latency allowance for the begin and for the guess to come
    // (R2-08's one clock), so never under 1:59 and never a reading from
    // before the time away.
    const resumed = await stopwatchSeconds(page);
    expect(resumed).toBeGreaterThanOrEqual(119);
    expect(resumed).toBeLessThanOrEqual(125);

    // Solved: on its reveal, the X keeps "Saved", and the clock is stopped.
    await guess(page, "Odile", /Odile Marsh/);
    await expect(
      page.getByRole("button", { name: "Next mystery" }),
    ).toBeVisible();
    const onReveal = await stopwatchText(page);
    await page.getByRole("link", { name: LEAVE_STOPPED, exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("[data-toast]")).toHaveText("Saved");
    await expect(card).not.toContainText("stopwatch");
    await page.clock.fastForward(120_000);
    await card.getByRole("link", { name: "Continue" }).click();
    await expect(
      page.getByRole("button", { name: "Next mystery" }),
    ).toBeVisible();
    expect(await stopwatchText(page)).toBe(onReveal);
  });

  test("R2-01 How to play says the stopwatch runs while you're away", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "How to play" }).click();
    const sheet = page.getByRole("dialog", { name: "How to play" });
    const rule =
      "The stopwatch runs while a clue is open, even while you're away or reading this, and stops on every reveal.";
    await expect(sheet).toContainText(rule);
    // /how-scoring-works carries How to play's text, and says it once.
    await page.goto("/how-scoring-works");
    await expect(page.getByText(rule)).toHaveCount(1);
  });
});

test.describe("R2-03 one clue-4 order per player", () => {
  // Pinned on purpose, so the orders below are the same on every run: the
  // mock's default seed ("qz"), which gives every fresh browser the same
  // first attempt id, and two device identities. Player 1's shuffle puts
  // the key at C on Mystery 1 and player 2's puts it at A; in round 2 both
  // would have seen it at A.
  const PLAYERS = [
    {
      playerId: "0a0a0a0a-1111-4111-8111-000000000001",
      key: 2,
    },
    {
      playerId: "0a0a0a0a-1111-4111-8111-000000000002",
      key: 0,
    },
  ] as const;

  /** A fresh browser with `playerId` already minted, on Daily #46. */
  async function freshBrowser(browser: Browser, playerId: string) {
    const context = await browser.newContext({ timezoneId: LONDON });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route(/^(?!http:\/\/127\.0\.0\.1:\d+\/)/, (route) =>
      route.abort(),
    );
    await page.addInitScript(
      ({ id, at }) => {
        if (localStorage.getItem("qz:identity") === null) {
          localStorage.setItem(
            "qz:identity",
            JSON.stringify({
              v: 1,
              playerId: id,
              // 43 base64url characters ending in one whose low two bits
              // are zero, as a minted secret has, or the identity layer
              // quarantines it and mints a new player.
              secret: `${"A".repeat(30)}${id.slice(-12)}A`,
              registered: false,
              createdAt: at,
              source: "minted",
              cookieSavedAt: null,
            }),
          );
        }
      },
      { id: playerId, at: Date.UTC(2026, 10, 5, 9) },
    );
    await mockInit(page, { seed: "qz" });
    // London keeps GMT in November, so local 09:00 is 09:00 UTC.
    await page.clock.setFixedTime(new Date(`${NOV_5}Z`));
    return { context, page, errors };
  }

  test("R2-03 two fresh browsers with different players reach clue 4 of Mystery 1 with different orders", async ({
    browser,
  }) => {
    const seen: { attempt: string; labels: string[] }[] = [];
    for (const player of PLAYERS) {
      const { context, page, errors } = await freshBrowser(
        browser,
        player.playerId,
      );
      try {
        await page.goto("/daily");
        await expect(
          round(page).getByRole("heading", { name: /clue 1/i }),
        ).toBeVisible();
        for (let clue = 1; clue < 4; clue += 1) {
          await page
            .getByRole("button", { name: /^(Next clue|Last clue)/ })
            .click();
        }
        const options = round(page).getByRole("button", { name: /^[A-D]\. / });
        await expect(options).toHaveCount(4);
        const labels = (await options.allTextContents()).map((text) =>
          text.replace(/^[A-D]\.?\s*/, "").trim(),
        );
        const attempts = await inspect<Record<string, unknown>>(
          page,
          "attempts",
        );
        seen.push({ attempt: Object.keys(attempts)[0] ?? "", labels });
        // The attempt is the pinned player's, not a new one minted over
        // an identity the device refused.
        expect(
          Object.values(attempts).map(
            (attempt) => (attempt as { playerId: string }).playerId,
          ),
        ).toEqual([player.playerId]);
        expect(labels[player.key]).toContain("Odile Marsh");
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
    const [first, second] = seen;
    // Both browsers minted the same first attempt id, round 2's condition.
    expect(second?.attempt).toBe(first?.attempt);
    expect(second?.labels).not.toEqual(first?.labels);
  });
});

test.describe("one clock (R2-08) and E's pill (R2-06)", () => {
  test("R2-08 two wrong guesses and two reloads in Mystery 2: the header's time at every verdict's press is the time on its reveal, and Lock in's is the stop screen's", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    /**
     * Picks `name` for `query`, then reads the stopwatch and presses Guess
     * in one go; the reveal must show that reading (R3-01, which replaced
     * this test's "greater than or equal").
     */
    const solveAtReading = async (query: string, name: RegExp) => {
      const field = round(page).getByRole("combobox");
      const option = page.getByRole("option", { name });
      await expect(async () => {
        await field.click();
        await field.fill(query);
        await expect(option).toBeVisible({ timeout: 1_000 });
      }).toPass();
      await option.click();
      const reading = await readAndPress(page, "Guess");
      await expect(
        page.getByRole("button", { name: /^(Next mystery|On to the Encore)$/ }),
      ).toBeVisible();
      expect(await stopwatchText(page)).toBe(reading);
      return reading;
    };

    await setClock(page, NOV_1, LONDON);
    await page.goto("/daily");
    await expect(
      round(page).getByRole("heading", { name: /clue 1/i }),
    ).toBeVisible();
    await page.clock.fastForward(20_300);
    await solveAtReading("Odile", /Odile Marsh/);
    await page.getByRole("button", { name: "Next mystery" }).click();

    // Mystery 2: a wrong guess, a reload, another wrong guess, a reload.
    await expect(
      round(page).getByRole("heading", { name: /clue 1/i }),
    ).toBeVisible();
    await page.clock.fastForward(12_300);
    await guess(page, "Ostr", /Ostravia/);
    await expect(
      round(page).getByRole("heading", { name: /clue 2/i }),
    ).toBeVisible();
    await page.reload();
    await expect(
      round(page).getByRole("heading", { name: /clue 2/i }),
    ).toBeVisible();
    await page.clock.fastForward(9_400);
    await guess(page, "Rosm", /Rosmaar/);
    await expect(
      round(page).getByRole("heading", { name: /clue 3/i }),
    ).toBeVisible();
    await page.reload();
    await expect(
      round(page).getByRole("heading", { name: /clue 3/i }),
    ).toBeVisible();
    await page.clock.fastForward(6_100);
    // A round resumed after two reloads: its reveal shows the reading at
    // the press, neither higher nor lower.
    const onReveal = await solveAtReading("Vald", /Valdoria/);
    // And the header adds each resolved round's recorded time, mid-Daily:
    // a reload, which reads them back from the server, shows the same.
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Next mystery" }),
    ).toBeVisible();
    expect(await stopwatchText(page)).toBe(onReveal);
    await page.getByRole("button", { name: "Next mystery" }).click();

    await expect(
      round(page).getByRole("heading", { name: /clue 1/i }),
    ).toBeVisible();
    await page.clock.fastForward(14_000);
    await solveAtReading("Bism", /Bismuth/);
    await page.getByRole("button", { name: "On to the Encore" }).click();
    // Wait for the Encore to open before moving the clock: a jump that lands
    // between the server issuing the round and the device opening it is
    // charged to the server alone, which is the honest-play case and not what
    // this test is about (it failed once that way under load).
    await expect(page.getByLabel(/your number/i)).toBeVisible();
    await page.clock.fastForward(8_000);
    await page.getByLabel(/your number/i).fill("90");
    // The button names the number since D37: "Lock in 90 km".
    const header = await readAndPress(page, "Lock in", { contains: true });
    await expect(
      page.getByRole("button", { name: "See your results" }),
    ).toBeVisible();

    // From Lock in the stopwatch stands on the reading at the press.
    expect(await stopwatchText(page)).toBe(header);
    await page.clock.fastForward(60_000);
    expect(await stopwatchText(page)).toBe(header);
    await page.getByRole("button", { name: "See your results" }).click();
    await expect(page).toHaveURL("/daily/42/results");
    await expect(page.locator("[data-time]")).toHaveText(
      `Time ${header} · only breaks ties`,
    );
  });

  test("R2-06 after Lock in, E's pill shows how far off the Encore was, and its accessible name says so", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily");
    await toTheEncore(page);
    await expect(pills(page).nth(3)).toContainText(
      "Encore, not started".replace("not started", "playing now"),
    );
    // 98 against 86.4 m: 13% off, in the close band.
    await lockIn(page, "98");
    const encore = pills(page).nth(3);
    await expect(encore).toContainText(
      "Encore, locked in, 13% off, a close guess",
    );
    await expect(encore.locator('[aria-hidden="true"]')).toHaveText("13%");
  });

  test("R2-06 a bullseye's pill shows the bullseye", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily");
    await toTheEncore(page);
    // 90 against 86.4 m: 4% off, a bullseye.
    await lockIn(page, "90");
    const encore = pills(page).nth(3);
    await expect(encore).toContainText("Encore, locked in, 4% off, a bullseye");
    await expect(encore.locator('[aria-hidden="true"]')).toHaveText("🎯");
  });
});

test.describe("the stop screen", () => {
  test("R2-24 the Encore row for a 13% guess reads Close guess, and R2-04's tiebreak order", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily");
    await toTheEncore(page);
    await lockIn(page, "98");
    await page.getByRole("button", { name: "See your results" }).click();
    const row = page.locator('[data-round-row="encore"]');
    await expect(row).toContainText("13% off");
    await expect(row).toContainText("Close guess");
  });

  test("R2-04 the Encore row says the closest Encore breaks a tie before time", async ({
    page,
  }) => {
    await mockInit(page, { scenario: "finished_today" });
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily/42/results");
    await expect(page.locator('[data-round-row="encore"]')).toContainText(
      "Breaks ties: closest Encore first, then time. Scores no points.",
    );
  });

  test("R2-09 D22 a miss ends in ❌ in the score card's grid and the share text, under the new legend, in both glyph sets", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily");
    await toOptionsAndPick(page, /Odile Marsh/);
    await page.getByRole("button", { name: "Next mystery" }).click();
    // Ostravia is one of Mystery 2's wrong options: a miss.
    await toOptionsAndPick(page, /Ostravia/);
    await page.getByRole("button", { name: "Next mystery" }).click();
    await toOptionsAndPick(page, /Bismuth/);
    await page.getByRole("button", { name: "On to the Encore" }).click();
    await lockIn(page, "90");
    await page.getByRole("button", { name: "See your results" }).click();
    await expect(page.locator("[data-score]")).toHaveText("2/12");
    await expect(page.locator("[data-score-rows]")).toContainText(
      "Geography 🟧🟧🟧❌",
    );
    await expect(page.locator("[data-legend]")).toHaveText(
      "🟧 clue used · ✅ solved · ❌ missed · ⬜ not needed",
    );
    const shared = (await page.locator("[data-share-text]").inputValue()).split(
      "\n",
    );
    expect(shared.slice(1, 4)).toEqual([
      "History 🟧🟧🟧✅",
      "Geography 🟧🟧🟧❌",
      "Science & Tech 🟧🟧🟧✅",
    ]);

    // High-contrast feedback keeps ❌, which reads by its shape.
    await page.evaluate(() => {
      const raw = localStorage.getItem("qz:settings");
      const settings = raw === null ? { v: 1 } : JSON.parse(raw);
      localStorage.setItem(
        "qz:settings",
        JSON.stringify({ ...settings, highContrast: true }),
      );
    });
    await page.reload();
    await expect(page.locator("[data-legend]")).toHaveText(
      "🟧 clue used · 🟦 solved · ❌ missed · ⬜ not needed",
    );
    const contrast = (
      await page.locator("[data-share-text]").inputValue()
    ).split("\n");
    expect(contrast[2]).toBe("Geography 🟧🟧🟧❌");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`R2-09 at 390 px in the ${colorScheme} theme, the score card's rows sit on a ${colorScheme === "dark" ? "charcoal" : "cream"} inset where 🟧 shows (screenshot)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme });
      await mockInit(page, { scenario: "finished_today" });
      await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
      await page.goto("/daily/42/results");
      const inset = page.locator("[data-score-inset]");
      await expect(inset).toContainText("Geography 🟧✅⬜⬜");
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every((animation) => animation.playState !== "running"),
      );
      const card = await inset.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const parent = element.closest("section")?.getBoundingClientRect();
        return {
          inset: { x: box.x, y: box.y, width: box.width, height: box.height },
          card:
            parent === undefined
              ? null
              : {
                  x: parent.x,
                  y: parent.y,
                  width: parent.width,
                  height: parent.height,
                },
        };
      });
      const shot = await page.screenshot({ clip: card.card ?? card.inset });
      const colours = await page.evaluate(
        async ({ base64, inset, frame }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          if (context === null) throw new Error("no 2d context");
          context.drawImage(image, 0, 0);
          const scale = image.width / frame.width;
          const at = (x: number, y: number) =>
            Array.from(
              context
                .getImageData(
                  Math.round(x * scale),
                  Math.round(y * scale),
                  1,
                  1,
                )
                .data.slice(0, 3),
            );
          const left = inset.x - frame.x;
          const top = inset.y - frame.y;
          // Inside the inset's padding, clear of its corners and the rows.
          const background = at(left + inset.width / 2, top + 5);
          // The card outside the inset, in its padding below the inset.
          const ticket = at(left + inset.width / 2, top + inset.height + 6);
          // Every orange pixel the inset holds: the 🟧 squares.
          const data = context.getImageData(
            Math.round(left * scale),
            Math.round(top * scale),
            Math.round(inset.width * scale),
            Math.round(inset.height * scale),
          ).data;
          let orange = 0;
          const sum = [0, 0, 0];
          for (let i = 0; i < data.length; i += 4) {
            const [r = 0, g = 0, b = 0] = [data[i], data[i + 1], data[i + 2]];
            if (r > 200 && g > 90 && g < 200 && b < 90) {
              orange += 1;
              sum[0] = (sum[0] ?? 0) + r;
              sum[1] = (sum[1] ?? 0) + g;
              sum[2] = (sum[2] ?? 0) + b;
            }
          }
          return {
            background,
            ticket,
            orange,
            square: sum.map((channel) => channel / Math.max(1, orange)),
          };
        },
        {
          base64: shot.toString("base64"),
          inset: card.inset,
          frame: card.card ?? card.inset,
        },
      );
      // Cream in light, charcoal in dark (memo §26): the inset's tokens.
      if (colorScheme === "dark") {
        expect(Math.max(...colours.background)).toBeLessThan(40);
      } else {
        expect(Math.min(...colours.background)).toBeGreaterThan(220);
      }
      // On the orange card: the ticket's eft fill shows around it.
      const [tr = 0, tg = 0, tb = 0] = colours.ticket;
      expect(tr - Math.max(tg, tb)).toBeGreaterThan(60);
      // The 🟧 squares are there and stand well apart from the inset.
      expect(colours.orange).toBeGreaterThan(40);
      const distance = Math.hypot(
        ...colours.square.map(
          (channel, index) => channel - (colours.background[index] ?? 0),
        ),
      );
      expect(distance).toBeGreaterThan(120);
    });
  }

  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ]) {
    test(`R2-10 at ${viewport.width} by ${viewport.height}, Share sits straight under the score card, inside the viewport and above the dock, with no scroll`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await mockInit(page, { scenario: "finished_today" });
      await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
      await page.goto("/daily/42/results");
      const share = page.getByRole("button", { name: /^Share/ });
      await expect(share).toBeVisible();
      const layout = await share.evaluate((button) => {
        const dock = document.querySelector("[data-results-dock]");
        const box = button.getBoundingClientRect();
        const header = document.querySelector("header");
        return {
          scrolled: window.scrollY,
          top: box.top,
          bottom: box.bottom,
          dockTop: dock?.getBoundingClientRect().top ?? 0,
          headerBottom: header?.getBoundingClientRect().bottom ?? 0,
          secondary: button.classList.contains("kn-btn-secondary"),
          afterCard:
            button
              .closest("[data-share-actions]")
              ?.previousElementSibling?.matches("section[aria-label]") ?? false,
        };
      });
      expect(layout.scrolled).toBe(0);
      expect(layout.top).toBeGreaterThanOrEqual(layout.headerBottom);
      expect(layout.bottom).toBeLessThanOrEqual(layout.dockTop);
      expect(layout.secondary).toBe(true);
      expect(layout.afterCard).toBe(true);
      await expect(
        page.getByRole("link", { name: "Done for today" }),
      ).toHaveClass(/kn-btn-primary/);
    });
  }
});

test.describe("Today's card", () => {
  test("R2-18 D25 How to play opens on Today before the Daily starts: no attempt is made and no clock runs", async ({
    page,
  }) => {
    await setClock(page, NOV_1, LONDON);
    await page.goto("/");
    const card = page.locator('[data-daily-card="not_started"]');
    await expect(card.locator("li").first()).toHaveText("A person · Easy");
    const open = card.getByRole("button", { name: "How to play" });
    await open.click();
    const sheet = page.getByRole("dialog", { name: "How to play" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { level: 3 })).toHaveText([
      "The clue ladder",
      "The points",
      "Clue 4",
      "The Encore",
      "The ranking",
    ]);
    // Opening it logs one how_to_play_open, with no round open (PRD §7.2).
    await expect
      .poll(async () =>
        (await trackLog(page)).filter(
          (event) => event.name === "how_to_play_open",
        ),
      )
      .toEqual([
        {
          name: "how_to_play_open",
          props: { round: "none", first_daily: true },
        },
      ]);
    // A minute of reading costs nothing: no attempt exists to time it.
    await page.clock.fastForward(60_000);
    expect(await inspect(page, "attempts")).toBeUndefined();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
    await expect(open).toBeFocused();
    expect(await inspect(page, "attempts")).toBeUndefined();

    await card.getByRole("link", { name: "Play today's Daily" }).click();
    await expect(
      round(page).getByRole("heading", { name: /clue 1/i }),
    ).toBeVisible();
    expect(await stopwatchSeconds(page)).toBeLessThanOrEqual(1);
  });

  test("R2-19 Play doesn't move when today's chips replace the placeholders", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    // A slow get_today, so the placeholders show first.
    await mockInit(page, { latencyMs: 1_500 });
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/");
    const card = page.locator("[data-daily-card]");
    // Round 3 changed the ticket line (D27, R3-02).
    await expect(card).toContainText("About 4 minutes · no time limit");
    const play = card.getByRole("link", { name: "Play today's Daily" });
    await expect(card.locator("li").first()).toHaveText("Easy");
    const before = await play.boundingBox();
    await expect(card.locator("li").first()).toHaveText("A person · Easy");
    // Today's chips run to two rows at 360 px, where the placeholders took one.
    const rows = await card
      .locator("[data-daily-chips] li")
      .evaluateAll(
        (items) =>
          new Set(
            items.map((item) => Math.round(item.getBoundingClientRect().top)),
          ).size,
      );
    expect(rows).toBe(2);
    const after = await play.boundingBox();
    expect(after?.y).toBe(before?.y);
    // And Quick play stays above the tab bar (DESIGN §12.1).
    const quick = await page
      .locator('[data-home-slot="practice"]')
      .getByRole("link", { name: "Quick play" })
      .filter({ visible: true })
      .boundingBox();
    const bar = await page
      .locator('nav[data-placement="bottom"]')
      .boundingBox();
    expect((quick?.y ?? 0) + (quick?.height ?? 0)).toBeLessThanOrEqual(
      bar?.y ?? 0,
    );
  });
});

test.describe("the share link (R2-20)", () => {
  test("R2-20 the share link opens Today for a fresh browser: Play today's Daily and no attempt, then one tap reaches clue 1 at 0:00", async ({
    page,
    browser,
  }) => {
    await mockInit(page, { scenario: "finished_today" });
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
    await page.goto("/daily/42/results");
    const link =
      (await page.locator("[data-share-text]").inputValue())
        .split("\n")
        .at(-1) ?? "";
    expect(new URL(link).pathname).toBe("/");

    // A friend's browser: nothing stored, nothing played.
    const context = await browser.newContext({ timezoneId: LONDON });
    const friend = await context.newPage();
    const errors: string[] = [];
    friend.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    friend.on("pageerror", (error) => errors.push(error.message));
    try {
      await friend.clock.setFixedTime(new Date("2026-11-01T09:00:00Z"));
      await friend.goto(link);
      await expect(friend).toHaveURL("/");
      const card = friend.locator('[data-daily-card="not_started"]');
      await expect(card.locator("li").first()).toHaveText("A person · Easy");
      await expect(
        card.getByRole("link", { name: "Play today's Daily" }),
      ).toBeVisible();
      expect(await inspect(friend, "attempts")).toBeUndefined();
      await card.getByRole("link", { name: "Play today's Daily" }).click();
      await expect(
        round(friend).getByRole("heading", { name: /clue 1/i }),
      ).toBeVisible();
      await expect(stopwatch(friend)).toHaveText(/\b0:00$/);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
