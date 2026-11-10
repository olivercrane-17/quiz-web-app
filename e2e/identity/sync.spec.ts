/**
 * The sync code on the mock build (PRD §3.10.2, §5.13; ARCHITECTURE §9.2,
 * IDN-2): a code made on one device restores the same player on another
 * (AC-SYN-01, two device namespaces in one context, sharing the mock
 * server), its typed forms (AC-SYN-02), the confirm step on a device with
 * progress (AC-SYN-06), what moves and what stays (AC-SYN-07), and the
 * backup cookie a restore posts.
 *
 * Also: the code never leaves in a URL before the restore form hydrates,
 * the field shows a whole code at 320 px, at 200% text and under the text
 * spacing overrides (PRD §3.12.4), and a code made from the keyboard takes
 * the focus and is announced.
 *
 * Device namespaces never touch the backup cookie (§9.1), so the cookie
 * test restores on the page's own, unnamespaced device. A WebKit that keeps
 * no Secure cookie on the suite's http://127.0.0.1 (ARCHITECTURE §9.3's
 * test note) skips only that test's cookie assertion
 * (`keepsSecureCookieHere`); the POST, its 204 and the restore still run.
 */
import type { BrowserContext, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { expectNoSeriousAxe } from "../support/axe";
import { setDevice } from "../support/devices";
import { mockInit } from "../support/mock";

/**
 * Whether this browser keeps a Secure cookie on the suite's
 * http://127.0.0.1 (ARCHITECTURE §9.3's test note). Chromium and Firefox
 * do, so they always assert the backup cookie; a WebKit that doesn't can
 * never hold `__Host-pid` here, so only that assertion is left out, noted
 * on the test, and the launch report's iPhone check covers it (production
 * is https). The probe sets and expires a cookie of its own from the page,
 * touching neither the app's storage nor its cookie.
 */
async function keepsSecureCookieHere(
  page: Page,
  browserName: string,
): Promise<boolean> {
  if (browserName !== "webkit") return true;
  const kept = await page.evaluate(() => {
    document.cookie = "__Host-qz-probe=1; Secure; Path=/; SameSite=Lax";
    const stored = document.cookie.includes("__Host-qz-probe=1");
    document.cookie =
      "__Host-qz-probe=; Max-Age=0; Secure; Path=/; SameSite=Lax";
    return stored;
  });
  if (!kept) {
    test.info().annotations.push({
      type: "webkit-cookie-gap",
      description:
        "WebKit keeps no Secure cookie on http://127.0.0.1: the backup cookie assertion runs on Chromium and Firefox (ARCHITECTURE §9.3)",
    });
  }
  return kept;
}

/** The seed whose first code holds both a 1 and a 0 (AC-SYN-02's I and O). */
const CODE_SEED = "ac-syn-02-0";

interface StoredIdentity {
  playerId: string;
  secret: string;
  registered: boolean;
  source: string;
  cookieSavedAt: number | null;
}

/** A device of its own in this context, optionally with a played Daily. */
async function deviceIn(
  context: BrowserContext,
  device: string,
  init: { finished?: boolean; seed?: string } = {},
): Promise<Page> {
  const page = await context.newPage();
  await setDevice(page, device);
  if (init.finished === true || init.seed !== undefined) {
    await mockInit(page, {
      ...(init.finished === true ? { scenario: "finished_today" } : {}),
      ...(init.seed === undefined ? {} : { seed: init.seed }),
    });
  }
  return page;
}

async function identityOf(
  page: Page,
  device: string | null,
): Promise<StoredIdentity | null> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null") as never,
    device === null ? "qz:identity" : `qz:d:${device}:identity`,
  );
}

/**
 * Today, for a device whose init scenario played today's Daily: the mock
 * seeds the scenario, and registers the device, once Today loads the
 * backend, as a real device registers with its own first write.
 */
async function openToday(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-daily-card="finished"]')).toBeVisible();
}

/** The device's own code, shown at /me/sync after Show my code. */
async function makeCode(page: Page): Promise<string> {
  await openToday(page);
  await page.goto("/me/sync");
  await page.getByRole("button", { name: "Show my code" }).click();
  const well = page.locator("[data-sync-code]");
  await expect(well).toBeVisible();
  return (await well.getAttribute("data-sync-code")) ?? "";
}

function grouped(code: string): string {
  return code.match(/.{4}/g)?.join("-") ?? code;
}

/** /restore once it has hydrated: Restore stays off until then. */
async function openRestore(page: Page): Promise<void> {
  await page.goto("/restore");
  await expect(page.getByRole("button", { name: "Restore" })).toBeEnabled();
}

async function restore(page: Page, typed: string): Promise<void> {
  await openRestore(page);
  await page.getByRole("textbox", { name: "Your sync code" }).fill(typed);
  await page.getByRole("button", { name: "Restore" }).click();
}

const EXAMPLE_CODE = "K7QX-2M9P-T4RW-8HNC";

/** The field's own boxes, for AC-A11Y-04's "no clipping" DOM check. */
function fieldBoxes(page: Page) {
  return page
    .getByRole("textbox", { name: "Your sync code" })
    .evaluate((field) => {
      const css = getComputedStyle(field);
      const lineHeight = Number.parseFloat(css.lineHeight);
      const padding =
        Number.parseFloat(css.paddingTop) +
        Number.parseFloat(css.paddingBottom);
      return {
        scrollWidth: field.scrollWidth,
        clientWidth: field.clientWidth,
        scrollHeight: field.scrollHeight,
        clientHeight: field.clientHeight,
        lines: Math.round((field.scrollHeight - padding) / lineHeight),
        right: field.getBoundingClientRect().right,
      };
    });
}

const NOTE = "[data-restore-notice] p";

test.use({ timezoneId: "Europe/London" });

test.describe("sync codes (PRD §3.10.2)", () => {
  test("AC-SYN-01 a code created on context A restores the same player id, streak and Daily stats on a fresh context B", async ({
    context,
  }) => {
    const a = await deviceIn(context, "phone-a", { finished: true });
    const code = await makeCode(a);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    await expect(a.getByText(grouped(code))).toBeVisible();
    const source = await identityOf(a, "phone-a");

    const b = await deviceIn(context, "phone-b");
    await restore(b, grouped(code));
    // B lands on Today as A's player, with A's streak and A's finished Daily.
    await expect(b).toHaveURL(/\/$/);
    await expect(b.locator(NOTE)).toHaveText(
      /^Welcome back, \S+ \S+\. Your 1-day streak is here\.$/,
    );
    await expect(b.locator('[data-daily-card="finished"]')).toBeVisible();
    const restored = await identityOf(b, "phone-b");
    expect(restored).toMatchObject({
      playerId: source?.playerId,
      registered: true,
      source: "sync",
    });
    // Its own credential: secrets never travel between devices.
    expect(restored?.secret).not.toBe(source?.secret);
    // The code came along, already saved: /me/sync shows the same one.
    await b.goto("/me/sync");
    await expect(b.locator("[data-sync-code]")).toHaveAttribute(
      "data-sync-code",
      code,
    );
    await expect(b.locator("[data-sync-saved]")).toBeVisible();
    // A still plays as itself.
    await a.goto("/");
    await expect(a.locator('[data-daily-card="finished"]')).toBeVisible();
  });

  test("Today's welcome-back note shows once: back on Today from Practice or Me, it is neither shown nor said again", async ({
    context,
  }) => {
    const a = await deviceIn(context, "phone-a", { finished: true });
    const code = await makeCode(a);
    const b = await deviceIn(context, "phone-b");
    await restore(b, code);
    const note = b.locator(NOTE).filter({ visible: true });
    await expect(note).toHaveText(/^Welcome back, /);
    const tabs = b.getByRole("navigation", { name: "Main" });
    for (const tab of ["Practice", "Me"]) {
      await tabs.getByRole("link", { name: tab, exact: true }).click();
      await expect(b).not.toHaveURL(/\/$/);
      await tabs.getByRole("link", { name: "Today", exact: true }).click();
      await expect(b).toHaveURL(/\/$/);
      await expect(
        b.locator('[data-daily-card="finished"]').filter({ visible: true }),
      ).toBeVisible();
      await expect(note).toHaveCount(0);
      await expect(b.locator("#qz-live-polite")).not.toContainText(
        "Welcome back",
      );
    }
  });

  test("AC-SYN-02 input variants (lowercase, no hyphens, I for 1, O for 0) redeem the same code", async ({
    context,
  }) => {
    const a = await deviceIn(context, "phone-a", {
      finished: true,
      seed: CODE_SEED,
    });
    const code = await makeCode(a);
    expect(code, "the seed's code holds a 1 and a 0").toMatch(
      /^(?=.*1)(?=.*0)/,
    );
    const playerId = (await identityOf(a, "phone-a"))?.playerId;

    const variants = [
      grouped(code).toLowerCase(),
      code,
      grouped(code).replaceAll("1", "I"),
      grouped(code).replaceAll("1", "l").replaceAll("0", "o"),
      code.replaceAll("0", "O").match(/.{4}/g)?.join(" ") ?? code,
    ];
    for (const [n, typed] of variants.entries()) {
      const device = `phone-${n + 1}b`;
      const b = await deviceIn(context, device);
      await restore(b, typed);
      await expect(b.locator(NOTE), typed).toBeVisible();
      expect((await identityOf(b, device))?.playerId, typed).toBe(playerId);
      await b.close();
    }
  });

  test("the field groups the code as it is typed", async ({ page }) => {
    await openRestore(page);
    const field = page.getByRole("textbox", { name: "Your sync code" });
    await field.pressSequentially("k7qx2m9pt4rw8hio");
    await expect(field).toHaveValue("K7QX-2M9P-T4RW-8H10");
    await expect(
      page.getByText(
        "You'll find it in Me, then Your sync code, on your other device.",
      ),
    ).toBeVisible();
  });

  test("AC-SYN-06 restoring onto a device with progress shows the confirm step; cancelling keeps the device's identity", async ({
    context,
  }) => {
    const a = await deviceIn(context, "phone-a", { finished: true });
    const code = await makeCode(a);
    const sourceId = (await identityOf(a, "phone-a"))?.playerId;

    // C has progress of its own: it started today's Daily.
    const c = await deviceIn(context, "phone-c");
    await c.goto("/");
    await c.getByRole("link", { name: "Play today's Daily" }).click();
    await expect(c.getByRole("heading", { name: /clue 1\b/i })).toBeVisible();
    const before = await identityOf(c, "phone-c");
    expect(before?.registered).toBe(true);

    await restore(c, code);
    const dialog = c.getByRole("dialog", {
      name: "Replace this device's progress?",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "This device has its own progress. Restoring replaces it with the profile from your code.",
      ),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(c).toHaveURL(/\/restore$/);
    expect(await identityOf(c, "phone-c")).toEqual(before);

    // Confirming switches it, and leaves its old player on the server.
    await c.getByRole("button", { name: "Restore" }).click();
    await dialog.getByRole("button", { name: "Restore" }).click();
    await expect(c.locator(NOTE)).toBeVisible();
    expect((await identityOf(c, "phone-c"))?.playerId).toBe(sourceId);
  });

  test("AC-SYN-07 the restore confirm step says what moves, and after a restore onto a fresh context the practice figures start empty", async ({
    context,
  }) => {
    const WHAT_MOVES =
      "Your streak, Daily history, Groups, challenges and achievements come with you. Practice stats stay on this device.";
    const a = await deviceIn(context, "phone-a", { finished: true });
    const code = await makeCode(a);
    // /me/sync says it too, and A's practice stays on A.
    await expect(a.getByText(WHAT_MOVES).first()).toBeVisible();
    await a.evaluate(() => {
      localStorage.setItem(
        "qz:d:phone-a:history",
        JSON.stringify([{ runId: "on-phone-a" }]),
      );
    });

    // The restore page says it, and so does the confirm step on a device
    // with progress: here practice alone, which stays, so nothing is
    // "replaced".
    const c = await deviceIn(context, "phone-c");
    await c.goto("/restore");
    await expect(c.getByText(WHAT_MOVES)).toBeVisible();
    await c.evaluate(() => {
      localStorage.setItem(
        "qz:d:phone-c:history",
        JSON.stringify([{ runId: "on-phone-c" }]),
      );
    });
    await restore(c, code);
    const dialog = c.getByRole("dialog", {
      name: "Restore your profile here?",
    });
    await expect(
      dialog.getByText(
        "Your practice stats on this device stay here. Restoring brings in the streak and Daily history from your code.",
      ),
    ).toBeVisible();
    await expect(dialog.getByText(WHAT_MOVES)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // A fresh context gets the profile and none of A's practice.
    const b = await deviceIn(context, "phone-b");
    await restore(b, code);
    await expect(b.locator(NOTE)).toBeVisible();
    const practice = await b.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) =>
          key.startsWith("qz:d:phone-b:") &&
          /:(history|practice|review|mastery)$/.test(key),
      ),
    );
    expect(practice).toEqual([]);
  });

  test("a restore posts the restored identity to the backup cookie", async ({
    page,
    context,
    browserName,
  }) => {
    const a = await deviceIn(context, "phone-a", { finished: true });
    const code = await makeCode(a);
    const playerId = (await identityOf(a, "phone-a"))?.playerId;

    const posted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/identity" &&
        response.request().method() === "POST",
    );
    await restore(page, code);
    expect((await posted).status()).toBe(204);
    await expect(page.locator(NOTE)).toBeVisible();
    const restored = await identityOf(page, null);
    expect(restored).toMatchObject({ playerId, source: "sync" });
    const cookies = await context.cookies();
    if (await keepsSecureCookieHere(page, browserName)) {
      expect(cookies.map((cookie) => cookie.name)).toEqual(["__Host-pid"]);
      expect(cookies[0]?.value).toBe(
        `v1.${restored?.playerId}.${restored?.secret}`,
      );
    } else {
      // Still no other cookie (AC-CKE-04).
      expect(cookies).toEqual([]);
    }
  });

  test("a wrong code says so, and the sixth failure in 15 minutes says to wait", async ({
    page,
    mock,
  }) => {
    // A minute into a 15-minute window, so the window can't end mid-test.
    await page.clock.install({ time: new Date("2026-11-05T10:01:00Z") });
    /** Failed redemptions the mock server has counted for this browser. */
    const failures = async () => {
      const rows = await mock.inspect<
        Record<string, { bucket: string; hits: number }> | undefined
      >("rateCounters");
      return Object.values(rows ?? {})
        .filter((row) => row.bucket === "sync_fail_15m")
        .reduce((sum, row) => sum + row.hits, 0);
    };
    await restore(page, "0000-0000-0000-0000");
    const error = page.locator("[data-restore-error]");
    await expect(error).toHaveText(
      "That code didn't work. Check for typos, or make a new code on your other device.",
    );
    await expect.poll(failures).toBe(1);
    for (let n = 2; n <= 5; n += 1) {
      await page.getByRole("button", { name: "Restore" }).click();
      await expect.poll(failures).toBe(n);
    }
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(error).toHaveText("Too many tries. Please wait 15 minutes.");
  });

  test("the sync code and restore screens pass axe and fit a 320 px screen", async ({
    context,
  }) => {
    const fits = (page: Page) =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    const a = await deviceIn(context, "phone-a", { finished: true });
    await makeCode(a);
    await expectNoSeriousAxe(a);
    await a.setViewportSize({ width: 320, height: 640 });
    await expect(a.locator("[data-sync-code]")).toBeVisible();
    expect(await fits(a)).toBe(true);

    const c = await deviceIn(context, "phone-c");
    await c.setViewportSize({ width: 320, height: 640 });
    await restore(c, "0000-0000-0000-0000");
    await expect(c.locator("[data-restore-error]")).toBeVisible();
    await expectNoSeriousAxe(c);
    expect(await fits(c)).toBe(true);
    // The confirm step, on a device with practice of its own.
    await c.evaluate(() => {
      localStorage.setItem(
        "qz:d:phone-c:history",
        JSON.stringify([{ runId: "on-phone-c" }]),
      );
    });
    await restore(c, "K7QX-2M9P-T4RW-8HNC");
    const dialog = c.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // axe reads the colours where the sheet comes to rest, not mid-rise.
    await dialog.evaluate((element) =>
      Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      ),
    );
    await expectNoSeriousAxe(c);
  });

  test("the field shows a whole code at 320 px and 360 px, at 200% text and under the text-spacing overrides", async ({
    page,
  }) => {
    const cases = [
      { width: 320, text: "100%", spacing: false, oneLine: true },
      { width: 360, text: "100%", spacing: false, oneLine: true },
      { width: 320, text: "100%", spacing: true, oneLine: false },
      { width: 320, text: "200%", spacing: false, oneLine: false },
      { width: 390, text: "200%", spacing: false, oneLine: false },
    ];
    for (const { width, text, spacing, oneLine } of cases) {
      const where = `${width} px, ${text} text${spacing ? ", text spacing" : ""}`;
      await page.setViewportSize({ width, height: 800 });
      await openRestore(page);
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, text);
      if (spacing) {
        // WCAG 1.4.12's overrides (AC-A11Y-06).
        await page.addStyleTag({
          content:
            "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
        });
      }
      const field = page.getByRole("textbox", { name: "Your sync code" });
      await field.fill(EXAMPLE_CODE);
      await expect(field).toHaveValue(EXAMPLE_CODE);
      const box = await fieldBoxes(page);
      expect(box.scrollWidth, where).toBeLessThanOrEqual(box.clientWidth);
      expect(box.scrollHeight, where).toBeLessThanOrEqual(box.clientHeight);
      expect(box.right, where).toBeLessThanOrEqual(width);
      if (oneLine) expect(box.lines, where).toBe(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        where,
      ).toBe(true);
    }
  });

  test("Show my code and Make a new code, from the keyboard, put focus on the code and say a new one is ready", async ({
    context,
  }) => {
    const a = await deviceIn(context, "phone-a", { finished: true });
    await openToday(a);
    await a.goto("/me/sync");
    const show = a.getByRole("button", { name: "Show my code" });
    await show.focus();
    await a.keyboard.press("Enter");
    const well = a.locator("[data-sync-code]");
    await expect(well).toBeFocused();
    const first = await well.getAttribute("data-sync-code");

    await a.getByRole("button", { name: "Make a new code" }).focus();
    await a.keyboard.press("Enter");
    const dialog = a.getByRole("dialog", { name: "Make a new code?" });
    await dialog.getByRole("button", { name: "Make a new code" }).focus();
    await a.keyboard.press("Enter");
    await expect(well).not.toHaveAttribute("data-sync-code", first ?? "");
    await expect(well).toBeFocused();
    await expect(a.locator("#qz-live-polite")).toHaveText(
      "New code ready. Your old code no longer works.",
    );
  });

  test("/me/sync has nothing to show before the first Daily", async ({
    page,
  }) => {
    await page.goto("/me/sync");
    await expect(
      page.getByText(/Your sync code arrives with your first Daily/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Restore from a code" }),
    ).toHaveAttribute("href", "/restore");
  });
});

/** A request or address that carries the code, in any of its forms. */
function carriesCode(url: string): boolean {
  const flat = decodeURIComponent(url).toUpperCase().replace(/[-\s]/g, "");
  return flat.includes(EXAMPLE_CODE.replaceAll("-", ""));
}

test.describe("before /restore hydrates (the code is a pass to the profile)", () => {
  test.describe("with JavaScript off", () => {
    test.use({ javaScriptEnabled: false });

    test("Enter and Restore send nothing: the code never reaches a URL or a request", async ({
      page,
    }) => {
      const requested: string[] = [];
      page.on("request", (request) => requested.push(request.url()));
      await page.goto("/restore");
      const field = page.getByRole("textbox", { name: "Your sync code" });
      const submit = page.getByRole("button", { name: "Restore" });
      await expect(submit).toBeDisabled();
      await field.fill(EXAMPLE_CODE);
      await field.press("Enter");
      await submit.click({ force: true });
      await page.waitForLoadState("load");
      expect(new URL(page.url()).pathname).toBe("/restore");
      expect(new URL(page.url()).search).toBe("");
      expect(carriesCode(page.url())).toBe(false);
      expect(requested.filter(carriesCode)).toEqual([]);
    });
  });

  test("while its scripts are still loading, Enter sends nothing, and Restore turns on once they have", async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The page's scripts wait; its HTML and styles arrive as usual.
    const script = (url: URL) =>
      url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".js");
    await page.route(script, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/restore", { waitUntil: "domcontentloaded" });
    const field = page.getByRole("textbox", { name: "Your sync code" });
    const submit = page.getByRole("button", { name: "Restore" });
    await expect(submit).toBeDisabled();
    await field.fill(EXAMPLE_CODE);
    await field.press("Enter");
    expect(new URL(page.url()).search).toBe("");
    release();
    await expect(submit).toBeEnabled();
    await page.unroute(script);
    expect(carriesCode(page.url())).toBe(false);
    expect(requested.filter(carriesCode)).toEqual([]);
  });
});
