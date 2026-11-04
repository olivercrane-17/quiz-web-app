/**
 * The E2E helpers of ARCHITECTURE §11.4 (e2e/support/), checked against the
 * mock build they serve: mockInit and mockControls, setClock, devices,
 * network, expectNoSeriousAxe and expectSealedPayloads. The page-free
 * halves (localInstant, sealedLeaks and the offline error filters) are
 * checked on literal inputs.
 */
import type { Page } from "@playwright/test";

import type { MysteryContent } from "../../src/engine/types";
import { expect, test } from "../fixtures";

import { expectNoSeriousAxe } from "./axe";
import { localInstant, setClock } from "./clock";
import { openDevice, PHONE_VIEWPORT } from "./devices";
import { mockControls, mockInit } from "./mock";
import {
  dropOfflineLoadErrors,
  dropOfflineNavigationErrors,
  goOffline,
  goOnline,
  OFFLINE_LOAD_ERROR,
  OFFLINE_NAVIGATION_ERROR,
} from "./network";
import {
  expectSealedPayloads,
  fixtureLookup,
  sealedLeaks,
  type LoggedResponse,
} from "./sealed";

/** The identity a page minted, from its own storage namespace. */
async function playerIdAt(page: Page, key: string): Promise<string> {
  await expect
    .poll(() => page.evaluate((name) => localStorage.getItem(name), key))
    .not.toBeNull();
  const raw = await page.evaluate((name) => localStorage.getItem(name), key);
  return (JSON.parse(raw ?? "{}") as { playerId: string }).playerId;
}

test.describe("mockInit and mockControls", () => {
  test.use({ timezoneId: "Europe/London" });

  test("a scenario holds from the first render, and the controls reach the page's mock", async ({
    page,
    mock,
  }) => {
    // Sunday 1 November 2026: Daily #42, a fixture Daily every scenario fits.
    await setClock(page, "2026-11-01T09:00:00", "Europe/London", {
      mode: "fixed",
    });
    await mockInit(page, { scenario: "finished_today", seed: "helpers" });
    await page.goto("/");
    await expect(
      page.locator("[data-daily-card]").getByRole("heading"),
    ).toHaveText("Done for today · 9/12");

    expect(await mock.inspect("scenario")).toEqual({ name: "finished_today" });
    await mock.setLatency(0);
    const responses = await mock.responses();
    expect(responses.length).toBeGreaterThan(0);
    expect(
      responses.every((response) => typeof response.method === "string"),
    ).toBe(true);
    // A control that isn't built yet rejects with the mock's own message.
    await expect(mock.addIncident(0, 1)).rejects.toThrow(/not built yet/);
  });

  test("a failure set before the first render reaches the first call", async ({
    page,
  }) => {
    await mockInit(page, {
      failures: [{ method: "sealed.start", code: "unreachable", times: 50 }],
    });
    await page.goto("/daily");
    await expect(
      page.locator('[data-daily-problem="unreachable"]'),
    ).toBeVisible();
    const failed = (await mockControls(page).responses()).filter(
      (response) => response.method === "sealed.start",
    );
    expect(failed[0]?.payload).toMatchObject({
      ok: false,
      error: { code: "unreachable" },
    });
  });
});

test.describe("setClock", () => {
  test.use({ timezoneId: "America/New_York" });

  test("localInstant reads a wall clock in a zone, across daylight saving", () => {
    expect(
      new Date(
        localInstant("2026-11-01T23:59:30", "Europe/London"),
      ).toISOString(),
    ).toBe("2026-11-01T23:59:30.000Z");
    // New York left daylight saving at 02:00 that morning: 09:00 is EST.
    expect(
      new Date(
        localInstant("2026-11-01T09:00", "America/New_York"),
      ).toISOString(),
    ).toBe("2026-11-01T14:00:00.000Z");
    // 01:30 happened twice in London on 25 October 2026: the first one.
    expect(
      new Date(localInstant("2026-10-25T01:30", "Europe/London")).toISOString(),
    ).toBe("2026-10-25T00:30:00.000Z");
    // London skipped 01:30 on 29 March 2026.
    expect(() => localInstant("2026-03-29T01:30", "Europe/London")).toThrow(
      /never happens/,
    );
  });

  test("sets the page clock to a local time in the context's zone", async ({
    page,
  }) => {
    const at = await setClock(page, "2026-11-01T09:00:00", "America/New_York");
    await page.goto("/");

    expect(at).toBe(Date.UTC(2026, 10, 1, 14));
    const shown = await page.evaluate(() => ({
      hour: new Date().getHours(),
      date: new Date().toDateString(),
    }));
    expect(shown).toEqual({ hour: 9, date: "Sun Nov 01 2026" });
  });

  test("refuses a zone the context wasn't created in", async ({ page }) => {
    await expect(
      setClock(page, "2026-11-01T09:00:00", "Asia/Tokyo"),
    ).rejects.toThrow(/test\.use\(\{ timezoneId: "Asia\/Tokyo" \}\)/);
  });
});

test.describe("devices", () => {
  test("each page acts as its own device against one shared mock database", async ({
    page,
    context,
  }) => {
    const phone = await openDevice(context, "phone-2", "phone");
    expect(phone.viewportSize()).toEqual(PHONE_VIEWPORT);

    await page.goto("/");
    await phone.goto("/");

    const main = await playerIdAt(page, "qz:identity");
    const second = await playerIdAt(phone, "qz:d:phone-2:identity");
    expect(main).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(main);
  });
});

test.describe("network", () => {
  test("goOffline and goOnline switch the page's connection", async ({
    page,
  }) => {
    // A static page, so no request is in flight to fail while offline:
    // each browser reports those in its own words.
    await page.setContent(
      '<!doctype html><html lang="en"><title>Connection</title><p>Waiting</p></html>',
    );
    await goOffline(page);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await goOnline(page);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  });

  test("dropOfflineNavigationErrors removes exactly Next's offline fallback", () => {
    const errors = [
      `console.error: ${OFFLINE_NAVIGATION_ERROR} for http://127.0.0.1/practice. Falling back to browser navigation.`,
      "console.error: something else broke",
      `console.error: ${OFFLINE_NAVIGATION_ERROR} for http://127.0.0.1/me.`,
    ];

    expect(dropOfflineNavigationErrors(errors)).toBe(2);
    expect(errors).toEqual(["console.error: something else broke"]);
  });

  test("dropOfflineLoadErrors removes only requests the offline context failed", () => {
    const errors = [
      `console.error: Failed to load resource: ${OFFLINE_LOAD_ERROR}`,
      "console.error: Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
      `console.error: Failed to load resource: ${OFFLINE_LOAD_ERROR}`,
    ];

    expect(dropOfflineLoadErrors(errors)).toBe(2);
    expect(errors).toEqual([
      "console.error: Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
    ]);
  });
});

test.describe("expectNoSeriousAxe", () => {
  test("passes a clean page and names each serious or critical violation", async ({
    page,
  }) => {
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Fine</title></head><body><main><h1>Fine</h1><p>Some text.</p></main></body></html>',
    );
    await expectNoSeriousAxe(page);

    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Broken</title></head><body><main><h1>Broken</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>',
    );
    await expect(expectNoSeriousAxe(page)).rejects.toThrow(/image-alt/);
  });
});

test.describe("expectSealedPayloads", () => {
  test.use({ timezoneId: "Europe/London" });

  /** Next clue up to the options, then the option named `option`. */
  async function toOptionsAndPick(page: Page, option: RegExp) {
    for (let clue = 1; clue < 4; clue += 1) {
      await page
        .getByRole("button", { name: /^(Next clue|Last clue)/ })
        .click();
    }
    await page.getByRole("button", { name: option }).click();
  }

  test("passes a fixture Daily checked mid-Mystery and once every round resolved", async ({
    page,
  }) => {
    // Sunday 1 November 2026: Daily #42, three Mysteries and an Encore.
    await setClock(page, "2026-11-01T09:00:00", "Europe/London");
    await page.goto("/daily");
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();

    const early = await expectSealedPayloads(page);
    expect(early.attempts).toHaveLength(1);
    expect(early.rounds).toBe(4);

    await toOptionsAndPick(page, /Odile Marsh/);
    await page.getByRole("button", { name: "Next mystery" }).click();
    await expect(page.getByRole("heading", { name: /clue 1/i })).toBeVisible();
    await expectSealedPayloads(page);

    await toOptionsAndPick(page, /Ostravia/);
    await page.getByRole("button", { name: "Next mystery" }).click();
    await toOptionsAndPick(page, /Bismuth/);
    await page.getByRole("button", { name: "On to the Encore" }).click();
    await page.getByLabel(/your number/i).fill("90");
    await page.getByRole("button", { name: "Lock in" }).click();
    await expect(
      page.getByRole("button", { name: "See your results" }),
    ).toBeVisible();

    const done = await expectSealedPayloads(page);
    expect(done.responses).toBeGreaterThan(early.responses);
  });

  test("sealedLeaks names every way a round can give itself away", () => {
    const lookup = fixtureLookup();
    const mystery = lookup.round("fx.m.geo.0101") as MysteryContent;
    const attempt = {
      id: "a1",
      rounds: [
        { spec: { contentId: "fx.m.geo.0101" } },
        { spec: { contentId: "fx.e.0101" } },
      ],
    };
    const open = (
      clue: number,
      clues: readonly string[],
      options: Record<string, unknown>[] | null = null,
    ) => ({
      family: "mystery",
      index: 0,
      clue,
      clues,
      options,
      wrongGuesses: [],
      issuedAt: 0,
    });
    const options = ["Arvenna", "Bellori", "Cassany", "Dorvia"].map(
      (label, index) => ({ index, label, alreadyGuessed: false }),
    );
    const start = (value: Record<string, unknown>): LoggedResponse => ({
      method: "sealed.start",
      at: 0,
      payload: { ok: true, value: { attemptId: "a1", resolved: [], ...value } },
    });
    const act = (value: Record<string, unknown>): LoggedResponse => ({
      method: "sealed.act",
      at: 0,
      payload: { ok: true, value },
    });

    // The way the server plays it: clue 1, then the options on clue 4.
    expect(
      sealedLeaks(
        [
          start({
            current: { index: 0, open: open(1, mystery.clues.slice(0, 1)) },
          }),
          act({
            verdict: {
              kind: "continue",
              open: open(4, mystery.clues, options),
            },
          }),
        ],
        [attempt],
        lookup,
      ),
    ).toEqual([]);

    const problems = sealedLeaks(
      [
        start({
          current: { index: 0, open: open(1, mystery.clues.slice(0, 2)) },
          note: "Not Arvenna, surely",
          debug: { encore: 212, item: "fx.m.geo.0101" },
        }),
        act({
          verdict: {
            kind: "continue",
            open: open(
              4,
              mystery.clues,
              options.map((option, index) => ({ ...option, key: index === 0 })),
            ),
          },
        }),
      ],
      [attempt],
      lookup,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("the content id fx.m.geo.0101"),
        expect.stringContaining("a Mystery on clue 1 carries 2 clue(s)"),
        expect.stringContaining("clue 2, not issued yet"),
        expect.stringContaining("answer name at .value.note"),
        expect.stringContaining("answer value at .value.debug.encore"),
        expect.stringContaining(
          "an option carries { alreadyGuessed,index,key,label }",
        ),
      ]),
    );
  });
});
