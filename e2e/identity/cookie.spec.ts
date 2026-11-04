/**
 * Guest identity and the backup cookie on the mock build (ARCHITECTURE §9,
 * IDN-1): the cookie `/api/identity` sets after registration (AC-CKE-01),
 * the silent restore of a wiped store (AC-CKE-02), the same-origin rule of
 * `/api/restore` (AC-CKE-03), the one cookie the app ever sets (AC-CKE-04),
 * a practice-only visit that registers nothing (AC-IDN-01), 30 new
 * identities from one browser (AC-IDN-05), and the registration copy for
 * both limit scopes (AC-IDN-04).
 *
 * `__Host-` cookies need `Secure`, which Chromium accepts on
 * http://127.0.0.1 (§9.3's test note). "Clearing local storage" clears the
 * device's `qz:` keys: the mock database (`qz-mock:*`) stands for the
 * server, which a wiped browser doesn't wipe.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page, Response } from "@playwright/test";

import {
  SHELL_ROUTES,
  type ShellRoute,
} from "../../src/features/shell/shell-routes";
import { expect, test } from "../fixtures";

const COOKIE = "__Host-pid";
const MAX_AGE_S = 34_560_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

interface StoredIdentity {
  playerId: string;
  secret: string;
  registered: boolean;
  source: string;
  cookieSavedAt: number | null;
}

interface TrackedEvent {
  name: string;
  props: Record<string, unknown>;
}

const playButton = (page: Page) =>
  page.getByRole("link", { name: "Play today's Daily" });
const clueHeading = (page: Page, clue: number) =>
  page.getByRole("heading", { name: new RegExp(`clue ${clue}\\b`, "i") });

/** Home has loaded its Daily card from the backend (so the boot has run). */
async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-daily-card] li").first()).toBeVisible();
}

function isBackupPost(response: Response): boolean {
  return (
    new URL(response.url()).pathname === "/api/identity" &&
    response.request().method() === "POST"
  );
}

async function storedIdentity(page: Page): Promise<StoredIdentity | null> {
  return page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("qz:identity") ?? "null",
      ) as StoredIdentity | null,
  );
}

async function trackLog(page: Page): Promise<TrackedEvent[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __qzTrackLog?: TrackedEvent[] }).__qzTrackLog ??
      [],
  );
}

/** Clears the device's storage (every `qz:` key), leaving the mock server and the cookies. */
async function wipeDeviceStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("qz:")) localStorage.removeItem(key);
    }
  });
}

/**
 * Plays from Home to clue 1 in one tap, and waits until the backup cookie is
 * set and the device has recorded it, so no identity write is still pending.
 */
async function registerFromHome(page: Page): Promise<Response> {
  await openHome(page);
  const backup = page.waitForResponse(isBackupPost);
  await playButton(page).click();
  await expect(clueHeading(page, 1)).toBeVisible();
  const response = await backup;
  await expect
    .poll(async () => (await storedIdentity(page))?.cookieSavedAt ?? null)
    .not.toBeNull();
  return response;
}

/** The mock database, read from the page's storage (the backend may not be loaded). */
async function mockTable<T>(page: Page, table: string): Promise<T | null> {
  return page.evaluate((name) => {
    const db = JSON.parse(
      localStorage.getItem("qz-mock:db:v1") ?? "{}",
    ) as Record<string, unknown> | null;
    return (db?.[name] ?? null) as never;
  }, table);
}

/**
 * Seeds the mock server's registration counters before the app loads, as
 * if `hits` new identities had registered in the window that holds `at`.
 * Rows follow src/backend/mock/server/identity.ts (`rateCounterKey`).
 */
async function seedRegistrations(
  page: Page,
  rows: { bucket: string; subject: string; windowMs: number; hits: number }[],
  at: number,
): Promise<void> {
  const counters = Object.fromEntries(
    rows.map((row) => {
      const windowStart = Math.floor(at / row.windowMs) * row.windowMs;
      return [
        `${row.bucket}|${row.subject}|${windowStart}`,
        { ...row, windowStart },
      ];
    }),
  );
  await page.addInitScript((seeded) => {
    if (localStorage.getItem("qz-mock:db:v1") === null) {
      localStorage.setItem(
        "qz-mock:db:v1",
        JSON.stringify({ rateCounters: seeded }),
      );
    }
  }, counters);
}

test.use({ timezoneId: "Europe/London" });

test.describe("the backup cookie (PRD §3.10.3)", () => {
  test("AC-CKE-01 after registration, /api/identity sets __Host-pid with HttpOnly, Secure, SameSite=Lax, Path=/ and a Max-Age of 34,560,000", async ({
    page,
    context,
  }) => {
    const response = await registerFromHome(page);
    expect(response.status()).toBe(204);
    expect(await response.headerValue("cache-control")).toBe("no-store");

    const identity = await storedIdentity(page);
    expect(identity).toMatchObject({ registered: true, source: "minted" });
    expect(response.request().postDataJSON()).toEqual({
      playerId: identity?.playerId,
      secret: identity?.secret,
    });

    const header = (await response.headerValue("set-cookie")) ?? "";
    const [pair = "", ...attributes] = header
      .split(";")
      .map((part) => part.trim());
    expect(pair).toBe(`${COOKIE}=v1.${identity?.playerId}.${identity?.secret}`);
    expect(attributes).toEqual(
      expect.arrayContaining([
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Path=/",
        `Max-Age=${MAX_AGE_S}`,
      ]),
    );

    // The browser stored it as set: host-only, for 400 days.
    const cookies = await context.cookies();
    expect(cookies).toHaveLength(1);
    const [cookie] = cookies;
    expect(cookie).toMatchObject({
      name: COOKIE,
      value: `v1.${identity?.playerId}.${identity?.secret}`,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    expect(
      Math.abs((cookie?.expires ?? 0) - (Date.now() / 1000 + MAX_AGE_S)),
    ).toBeLessThan(300);
    // HttpOnly: no script on the page can read it.
    expect(await page.evaluate(() => document.cookie)).not.toContain(COOKIE);
    // The device recorded when the backup landed (the 7-day refresh counts from it).
    const saved = (await storedIdentity(page))?.cookieSavedAt ?? 0;
    expect(Math.abs(saved - Date.now())).toBeLessThan(60_000);
  });

  test("AC-CKE-02 clearing local storage (not cookies) and reloading restores the same identity with no visible prompt, and logs both events", async ({
    page,
    mock,
  }) => {
    await registerFromHome(page);
    await page.getByRole("button", { name: /^(Next clue|Last clue)/ }).click();
    await expect(clueHeading(page, 2)).toBeVisible();
    const before = await storedIdentity(page);
    expect(before?.registered).toBe(true);

    await wipeDeviceStorage(page);
    expect(await storedIdentity(page)).toBeNull();
    const restore = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/restore",
    );
    await page.reload();
    expect((await restore).status()).toBe(200);

    // The same attempt picks up at clue 2: the server knows this identity.
    await expect(clueHeading(page, 2)).toBeVisible();
    const after = await storedIdentity(page);
    expect(after).toMatchObject({
      playerId: before?.playerId,
      secret: before?.secret,
      registered: true,
      source: "cookie",
    });
    await expect
      .poll(async () =>
        (await trackLog(page)).filter((event) =>
          ["identity_restored", "storage_lost"].includes(event.name),
        ),
      )
      .toEqual([
        { name: "identity_restored", props: { source: "cookie" } },
        { name: "storage_lost", props: {} },
      ]);
    // No prompt of any kind: the restore is silent.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.locator("[data-daily-problem]")).toHaveCount(0);
    // One player on the server: nothing registered twice.
    const players = await mock.inspect<Record<string, unknown>>("players");
    expect(Object.keys(players)).toEqual([before?.playerId]);
  });

  test("AC-CKE-03 /api/restore returns 403 when Sec-Fetch-Site is cross-site or missing", async ({
    page,
    request,
  }) => {
    await registerFromHome(page);
    const identity = await storedIdentity(page);
    const cookie = `${COOKIE}=v1.${identity?.playerId}.${identity?.secret}`;

    const crossSite = await request.get("/api/restore", {
      headers: { "Sec-Fetch-Site": "cross-site", Cookie: cookie },
    });
    expect(crossSite.status()).toBe(403);
    expect(await crossSite.text()).not.toContain(identity?.secret ?? "?");
    // Playwright's request context sends no Sec-Fetch-Site of its own.
    const missing = await request.get("/api/restore", {
      headers: { Cookie: cookie },
    });
    expect(missing.status()).toBe(403);
    expect(await missing.text()).not.toContain(identity?.secret ?? "?");
    for (const site of ["same-site", "none"]) {
      const response = await request.get("/api/restore", {
        headers: { "Sec-Fetch-Site": site, Cookie: cookie },
      });
      expect(response.status(), site).toBe(403);
    }
    for (const response of [crossSite, missing]) {
      expect(response.headers()["cache-control"]).toBe("no-store");
    }

    // The page's own fetch is same-origin, and gets the identity back.
    const own = await page.evaluate(async () => {
      const response = await fetch("/api/restore", { cache: "no-store" });
      return { status: response.status, body: await response.json() };
    });
    expect(own).toEqual({
      status: 200,
      body: { playerId: identity?.playerId, secret: identity?.secret },
    });
  });

  test("POST and DELETE /api/identity refuse cross-site requests, so no page can plant or clear the cookie", async ({
    request,
    baseURL,
  }) => {
    const data = {
      playerId: "0f8fad5b-d9cb-469f-a165-70867728950e",
      secret: "kq3Zr0x9TWb7vY4mN2cH8sLp6eJd1gAfUoXiRtBnM5w",
    };
    const attempts: Record<string, string>[] = [
      { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" },
      { "Sec-Fetch-Site": "same-site", Origin: baseURL ?? "" },
      { Origin: baseURL ?? "" },
      { "Sec-Fetch-Site": "same-origin", Origin: "https://evil.example" },
      { "Sec-Fetch-Site": "same-origin" },
    ];
    for (const headers of attempts) {
      const posted = await request.post("/api/identity", { headers, data });
      expect(posted.status(), JSON.stringify(headers)).toBe(403);
      expect(posted.headers()["set-cookie"]).toBeUndefined();
      const deleted = await request.delete("/api/identity", { headers });
      expect(deleted.status(), JSON.stringify(headers)).toBe(403);
      expect(deleted.headers()["set-cookie"]).toBeUndefined();
    }
    const sameOrigin = {
      "Sec-Fetch-Site": "same-origin",
      Origin: baseURL ?? "",
    };
    const malformed = await request.post("/api/identity", {
      headers: sameOrigin,
      data: { playerId: "not-a-player", secret: "short" },
    });
    expect(malformed.status()).toBe(400);
    const deleted = await request.delete("/api/identity", {
      headers: sameOrigin,
    });
    expect(deleted.status()).toBe(204);
    expect(deleted.headers()["set-cookie"]).toMatch(
      /^__Host-pid=; Max-Age=0; Path=\/; Secure; HttpOnly; SameSite=Lax$/,
    );
  });
});

/** Every page the build has (its own route list), with an address for each dynamic segment. */
function builtPages(): string[] {
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), ".next/app-path-routes-manifest.json"),
      "utf8",
    ),
  ) as Record<string, string>;
  return [...new Set(Object.values(manifest))]
    .filter((path) => !path.startsWith("/api/") && !path.startsWith("/_"))
    .map((path) =>
      path.replace("[number]", "42").replace("[slug]", "geography"),
    )
    .sort();
}

/** A realistic address for each rewritten shell (§10.1). */
function shellExample(route: ShellRoute): string {
  return route.source
    .replace(":code", route.source.startsWith("/join") ? "482913" : "AB12CD34")
    .replace(":token", "kq3Zr0x9TWb7vY4mN2cH8sLp6eJd1gAfUoXiRtBnM5w")
    .replace(
      /:(groupId|roomId|quizId)/,
      "0f8fad5b-d9cb-469f-a165-70867728950e",
    );
}

/** Chromium reports a document's 404 as a failed resource; the not-found and Beta pages expect it. */
function dropNotFoundReports(errors: string[]): void {
  for (let index = errors.length - 1; index >= 0; index -= 1) {
    if (errors[index]?.includes("status of 404 (Not Found)")) {
      errors.splice(index, 1);
    }
  }
}

test.describe("one cookie only", () => {
  test("AC-CKE-04 no other cookie is ever set by the app, on any route, through registration and a restore", async ({
    page,
    context,
    consoleErrors,
  }) => {
    test.setTimeout(180_000);
    const setCookies: Promise<string | null>[] = [];
    context.on("response", (response) => {
      // A response whose document has navigated away may no longer give up
      // its raw headers; the cookie jar below still sees anything stored.
      setCookies.push(response.headerValue("set-cookie").catch(() => null));
    });

    // Register first, so every later page runs with the backup cookie set.
    await registerFromHome(page);
    const routes = [
      ...builtPages(),
      ...SHELL_ROUTES.map(shellExample),
      "/no-such-page",
    ];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
    }
    dropNotFoundReports(consoleErrors);

    // A wiped store restores from the cookie, and re-posts it.
    await openHome(page);
    await wipeDeviceStorage(page);
    const repost = page.waitForResponse(isBackupPost);
    await page.reload();
    expect((await repost).status()).toBe(204);

    const headers = (await Promise.all(setCookies)).filter(
      (value): value is string => value !== null,
    );
    expect(headers.length).toBeGreaterThanOrEqual(2);
    for (const header of headers) {
      for (const line of header.split("\n")) {
        expect(line.startsWith(`${COOKIE}=`), line).toBe(true);
      }
    }
    const jar = await context.cookies();
    expect(jar.map((cookie) => cookie.name)).toEqual([COOKIE]);
    expect(await page.evaluate(() => document.cookie)).toBe("");
  });
});

test.describe("guest identity (PRD §3.10.1)", () => {
  test("AC-IDN-01 a first visit followed by only practice makes zero identity requests to the backend", async ({
    page,
    mock,
  }) => {
    const apiCalls: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/")) {
        apiCalls.push(`${request.method()} ${pathname}`);
      }
    });

    await openHome(page);
    await page
      .locator('[data-home-slot="practice"]')
      .getByRole("link", { name: "Quick play" })
      .click();
    await expect(page).toHaveURL("/practice/run");
    // As e2e/practice/greybox.spec.ts plays: pick, wait for the verdict,
    // complete the reveal, then Continue.
    const round = page.locator('[data-round="choice"]');
    for (let question = 1; question <= 10; question += 1) {
      await expect(round.getByText(`Question ${question} of 10`)).toBeVisible();
      const option = round
        .locator("[data-question] ol")
        .getByRole("button")
        .first();
      await option.click();
      await expect(option).toHaveAttribute(
        "data-state",
        /^(correct|your-answer)$/,
      );
      await round.getByRole("heading", { level: 1 }).click();
      await expect(round.getByRole("region")).toBeVisible();
      await round
        .getByRole("button", { name: /^(Next question|See your results)$/ })
        .click();
    }
    await expect(page).toHaveURL("/practice/results");

    // The backend heard no identity call and no write that registers one.
    const methods = (await mock.responses()).map((entry) => entry.method);
    expect(methods.length).toBeGreaterThan(0);
    expect(
      methods.filter(
        (method) =>
          method.startsWith("identity.") || method.startsWith("sealed."),
      ),
    ).toEqual([]);
    expect(await mockTable(page, "players")).toBeNull();
    expect(await mockTable(page, "credentials")).toBeNull();
    // Our own cookie route was asked once (it never reaches the backend), and nothing was posted.
    expect(apiCalls).toEqual(["GET /api/restore"]);
    expect(await storedIdentity(page)).toMatchObject({
      registered: false,
      source: "minted",
    });
  });

  test("AC-IDN-05 30 fresh identities from one IP within 10 minutes each reach clue 1 in one tap, with no refusal", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const start = Date.UTC(2026, 10, 1, 9, 0, 0);
    await page.clock.install({ time: start });
    const players = new Set<string>();
    for (let n = 0; n < 30; n += 1) {
      if (n > 0) {
        // A new device: nothing in storage, no backup cookie.
        await wipeDeviceStorage(page);
        await context.clearCookies();
        await page.clock.setSystemTime(start + n * 20_000);
      }
      const backup = await registerFromHome(page);
      expect(backup.status(), `identity ${n + 1}`).toBe(204);
      const identity = await storedIdentity(page);
      expect(identity?.registered, `identity ${n + 1}`).toBe(true);
      players.add(identity?.playerId ?? "");
    }
    expect(players.size).toBe(30);
    const rows = await mockTable<Record<string, { lowTrust?: boolean }>>(
      page,
      "players",
    );
    expect(Object.keys(rows ?? {}).sort()).toEqual([...players].sort());
    expect(
      Object.values(rows ?? {}).every((row) => row.lowTrust === false),
    ).toBe(true);
  });
});

test.describe("registration refused by a limit (AC-IDN-04)", () => {
  const burst = {
    bucket: "identity_1m",
    subject: "ip:local",
    windowMs: MINUTE,
  };
  const ceiling = {
    bucket: "identity_all_1h",
    subject: "project",
    windowMs: HOUR,
  };

  const problemCard = (page: Page) =>
    page.locator('[data-daily-problem="rate_limited"]');

  async function refusedStart(page: Page, at: number) {
    await page.clock.install({ time: at });
    await openHome(page);
    await playButton(page).click();
    await expect(page).toHaveURL("/daily");
    // Silent at first: the client retries without a word for 5 s.
    await page.clock.runFor(2_000);
    await expect(page.locator("[data-daily-problem]")).toHaveCount(0);
    await expect(clueHeading(page, 1)).toHaveCount(0);
  }

  async function acceptedRetry(page: Page) {
    // Practice is offered only from 30 s of refusals.
    await expect(
      page.getByRole("link", { name: "Play practice instead" }),
    ).toHaveCount(0);
    // Retry-After ends with the window; the first accepted retry reaches clue 1, no tap.
    await page.clock.runFor(25_000);
    await expect(clueHeading(page, 1)).toBeVisible();
    await expect(page).toHaveURL("/daily");
    await expect(page.locator("[data-daily-problem]")).toHaveCount(0);
  }

  test("AC-IDN-04 a burst refusal says 'on your network' after 5 s, then the first accepted retry reaches clue 1", async ({
    page,
  }) => {
    const at = Date.UTC(2026, 10, 1, 9, 0, 40);
    await seedRegistrations(
      page,
      [
        { ...burst, hits: 20 },
        { ...ceiling, hits: 20 },
      ],
      at,
    );
    await refusedStart(page, at);
    await page.clock.runFor(4_000);
    await expect(
      problemCard(page).getByRole("heading", {
        name: /^Lots of new players on your network right now\. Trying again/,
      }),
    ).toBeVisible();
    await acceptedRetry(page);
  });

  test("AC-IDN-04 a project-wide ceiling refusal says 'Lots of new players right now' after 5 s, then the first accepted retry reaches clue 1", async ({
    page,
  }) => {
    const at = Date.UTC(2026, 10, 1, 9, 59, 40);
    await seedRegistrations(page, [{ ...ceiling, hits: 5000 }], at);
    await refusedStart(page, at);
    await page.clock.runFor(4_000);
    await expect(
      problemCard(page).getByRole("heading", {
        name: /^Lots of new players right now\. Trying again/,
      }),
    ).toBeVisible();
    await expect(problemCard(page)).not.toContainText("on your network");
    await acceptedRetry(page);
  });
});
