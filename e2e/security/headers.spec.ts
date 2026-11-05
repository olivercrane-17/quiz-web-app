/**
 * The security headers of a production build (SEC-1, ARCHITECTURE §10.8):
 * the exact headers on /, /daily, /sw.js and /api/restore, the per-path
 * caching rules, the app's own inline scripts running under the Content
 * Security Policy, and no violation while the app plays.
 *
 * The E2E build uses the mock backend over http, so its policy names no
 * Supabase origin and asks for no upgrade to https. The Supabase, https,
 * preview and development policies are scripts/checks/security-headers
 * .test.ts's. Every test here also fails on any console error, which is how
 * Chromium reports a CSP violation, so every other spec guards the policy
 * too.
 */
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import type { APIResponse, Page } from "@playwright/test";

import { PUBLIC_ENV_NAMES } from "../../src/lib/env-parse";
import { expect, test } from "../fixtures";
import { setClock } from "../support/clock";

const PROJECT_DIR = path.resolve(__dirname, "..", "..");
const NEXT_BIN = path.join(PROJECT_DIR, "node_modules/next/dist/bin/next");

/** A mock build over http: 'self' only, and no upgrade-insecure-requests. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** What every response carries (§10.8; PRD §8.4). */
const EVERY_RESPONSE: Readonly<Record<string, string>> = {
  "content-security-policy": CSP,
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()",
};

type HeaderLines = { name: string; value: string }[];

/** Each expected header sent exactly once, with exactly this value; and no X-Powered-By. */
function expectExactHeaders(
  lines: HeaderLines,
  expected: Readonly<Record<string, string>>,
): void {
  const sent = (name: string) =>
    lines
      .filter((line) => line.name.toLowerCase() === name)
      .map((line) => line.value);
  for (const [name, value] of Object.entries(expected)) {
    expect(sent(name), name).toEqual([value]);
  }
  expect(sent("x-powered-by")).toEqual([]);
}

function linesOf(response: APIResponse): HeaderLines {
  return response.headersArray();
}

/** A port nothing listens on right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (typeof address === "object" && address !== null) {
          resolve(address.port);
        } else {
          reject(new Error("the port probe has no address"));
        }
      });
    });
  });
}

/**
 * Runs `check` against a `next start` of this very build whose public/ also
 * holds a stub worker, for builds that don't write public/sw.js yet (PWA-1
 * adds it to `npm run build`). The server runs from a temporary folder of
 * links to the build, the config and public/'s entries, so the shared
 * public/ is never written: the PWA spike owns public/sw.js while it runs.
 */
async function withStubWorker<T>(
  baseURL: string,
  check: (origin: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "qz-sw-headers-"));
  for (const name of [
    ".next",
    "node_modules",
    "src",
    "package.json",
    "next.config.ts",
    "tsconfig.json",
  ]) {
    symlinkSync(path.join(PROJECT_DIR, name), path.join(dir, name));
  }
  mkdirSync(path.join(dir, "public"));
  for (const entry of readdirSync(path.join(PROJECT_DIR, "public"))) {
    if (entry === "sw.js" || entry === "sw.js.map") continue;
    symlinkSync(
      path.join(PROJECT_DIR, "public", entry),
      path.join(dir, "public", entry),
    );
  }
  writeFileSync(
    path.join(dir, "public", "sw.js"),
    "self.addEventListener('install', () => self.skipWaiting());\n",
  );

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [NEXT_BIN, "start", dir, "--hostname", "127.0.0.1", "--port", String(port)],
    {
      env: {
        ...process.env,
        // The web server's variables (playwright.config.ts).
        ...Object.fromEntries(PUBLIC_ENV_NAMES.map((name) => [name, ""])),
        NEXT_PUBLIC_BACKEND_MODE: "mock",
        NEXT_PUBLIC_SITE_URL: baseURL,
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_ENV: "production",
      },
      // Its own process group, so the cleanup reaches the server it starts.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", (chunk: Buffer) => (log += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (log += chunk.toString()));
  const exited = new Promise<void>((resolve) => child.once("exit", resolve));
  try {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const response = await fetch(`${origin}/sw.js`, {
        signal: AbortSignal.timeout(2_000),
      }).catch(() => null);
      if (response?.ok === true) break;
      if (child.exitCode !== null || Date.now() > deadline) {
        throw new Error(`the worker server never served /sw.js:\n${log}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return await check(origin);
  } finally {
    if (child.exitCode === null && child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // It has already exited.
      }
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // It exited on SIGTERM.
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Collects every CSP violation the page reports, from before its first script. */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as { __qzCspViolations?: string[] }).__qzCspViolations = seen;
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(
        `${event.effectiveDirective} blocked ${event.blockedURI || "inline"} at ${event.sourceFile}:${event.lineNumber}`,
      );
    });
  });
  return () =>
    page.evaluate(
      () =>
        (window as { __qzCspViolations?: string[] }).__qzCspViolations ?? [],
    );
}

test.describe("security headers", () => {
  for (const route of ["/", "/daily"]) {
    test(`${route} carries exactly the security headers`, async ({
      request,
    }) => {
      const response = await request.get(route);

      expect(response.status()).toBe(200);
      expectExactHeaders(linesOf(response), EVERY_RESPONSE);
    });
  }

  test("/api/restore carries the security headers and is never cached", async ({
    request,
  }) => {
    const response = await request.get("/api/restore", {
      headers: { "Sec-Fetch-Site": "same-origin" },
    });

    expect(response.status()).toBe(204);
    expectExactHeaders(linesOf(response), {
      ...EVERY_RESPONSE,
      "cache-control": "no-store",
    });
  });

  test("/api/restore keeps its headers when it refuses a cross-site request", async ({
    request,
  }) => {
    const response = await request.get("/api/restore", {
      headers: { "Sec-Fetch-Site": "cross-site" },
    });

    expect(response.status()).toBe(403);
    expectExactHeaders(linesOf(response), {
      ...EVERY_RESPONSE,
      "cache-control": "no-store",
    });
  });

  test("/sw.js is revalidated on every check and may control the whole site", async ({
    request,
    baseURL,
  }) => {
    const expected = {
      ...EVERY_RESPONSE,
      "cache-control": "no-cache",
      "service-worker-allowed": "/",
    };
    const served = await request.get("/sw.js");
    if (served.ok()) {
      expectExactHeaders(linesOf(served), expected);
      return;
    }
    // This build writes no worker yet: check the same build with a stub one.
    expect(served.status()).toBe(404);
    await withStubWorker(baseURL ?? "", async (origin) => {
      const response = await fetch(`${origin}/sw.js`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(
        /^application\/javascript/,
      );
      // fetch joins repeated headers, so an exact match also rules out a second value.
      for (const [name, value] of Object.entries(expected)) {
        expect(response.headers.get(name), name).toBe(value);
      }
      expect(response.headers.get("x-powered-by")).toBeNull();
    });
  });

  test("packs and answer lists are cached for a year as immutable", async ({
    request,
  }) => {
    const packs = readdirSync(path.join(PROJECT_DIR, "public/content/packs"));
    const pack = packs.find((name) => name.endsWith(".json"));
    expect(pack, "a generated pack under public/content/packs").toBeDefined();

    const response = await request.get(`/content/packs/${pack ?? ""}`);

    expect(response.status()).toBe(200);
    expectExactHeaders(linesOf(response), {
      ...EVERY_RESPONSE,
      "cache-control": "public, max-age=31536000, immutable",
    });
  });
});

test.describe("the Content Security Policy in the browser", () => {
  test.use({ timezoneId: "Europe/London" });

  test("lets the app's own inline scripts run before any of our JavaScript: the boot script and Today's intro", async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        "qz:settings",
        JSON.stringify({ v: 1, theme: "dark", highContrast: true }),
      );
    });
    // Our chunks served empty: only the HTML, the CSS and the inline scripts run.
    await page.route("**/_next/static/**/*.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await setClock(page, "2026-11-01T09:00", "Europe/London");

    const response = await page.goto("/");

    expect(response?.headers()["content-security-policy"]).toBe(CSP);
    // The boot script in <head> ran.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "on");
    // Today's intro script ran: the device's date and greeting replaced the placeholders.
    await expect(page.locator("#qz-home-date")).toHaveText("Sunday 1 November");
    await expect(page.locator("#qz-home-greeting")).toHaveText("Good morning.");
    expect(await violations()).toEqual([]);
  });

  test("reports no violation while Today, the Daily and Quick play load, hydrate and play", async ({
    page,
  }) => {
    const violations = await watchViolations(page);

    await page.goto("/");
    await expect(page.locator("[data-daily-card] li").first()).toBeVisible();
    expect(await violations()).toEqual([]);

    await page.getByRole("link", { name: "Play today's Daily" }).click();
    await expect(
      page.getByRole("heading", { name: /clue 1\b/i }),
    ).toBeVisible();
    expect(await violations()).toEqual([]);

    await page.goto("/");
    await page.getByRole("link", { name: "Quick play" }).first().click();
    await expect(
      page.locator('main [data-state="idle"]').first(),
    ).toBeVisible();
    await page.locator('main [data-state="idle"]').first().click();
    expect(await violations()).toEqual([]);
  });

  test("keeps the page's Origin on the identity routes' POSTs under no-referrer, in fetch's default mode", async ({
    page,
    consoleErrors,
    baseURL,
    browserName,
  }) => {
    await page.goto("/");
    const originOf = async (mode: RequestMode) => {
      const request = page.waitForRequest(
        (candidate) => candidate.headers()["x-qz-probe"] === mode,
      );
      const status = await page.evaluate(async (fetchMode) => {
        const response = await fetch("/api/identity", {
          method: "POST",
          mode: fetchMode,
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-Qz-Probe": fetchMode,
          },
          body: "{}",
        });
        return response.status;
      }, mode);
      return { origin: (await (await request).allHeaders()).origin, status };
    };

    // src/platform/identity/backup.ts's mode: the page's own origin, so
    // the route reads the (empty) body and answers 400 rather than 403.
    expect(await originOf("cors")).toEqual({
      origin: new URL(baseURL ?? "").origin,
      status: 400,
    });
    if (browserName === "chromium") {
      // What backup.ts must never do: under no-referrer, a same-origin-mode
      // POST says `Origin: null`, and the route refuses it [verified in
      // Chromium; the Fetch spec asks the same of every engine].
      expect(await originOf("same-origin")).toEqual({
        origin: "null",
        status: 403,
      });
    }

    // The browser reports the refusals this test provoked as failed loads.
    const provoked = (error: string) =>
      /status of 40[03]\b/.test(error) && error.includes("Failed to load");
    expect(consoleErrors.filter((error) => !provoked(error))).toEqual([]);
    consoleErrors.splice(0, consoleErrors.length);
  });
});
