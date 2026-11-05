/**
 * PWA-0, the service-worker spike (ARCHITECTURE §10.7, §12.3). It runs in
 * pwa-chromium, the one project that lets service workers run.
 *
 * The chain under test is `next build`, `serwist build`, `next start`. This
 * project's web server has run `next build`. The `spike` fixture runs
 * `serwist build` on that build (scripts/pwa/spike/build.mts writes
 * public/sw.js), then starts a `next start` of its own: `next start` reads
 * public/ once, when it starts, and the web server started before the
 * worker existed. The test registers the worker on a first visit, then takes
 * the context offline and stops that server, and plays /practice/run to its
 * results from the precache alone.
 *
 * Once `npm run build` writes PWA-1's own worker to public/sw.js, the spike
 * has done its job and the test skips itself.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

import type { Browser, Page } from "@playwright/test";

import {
  isSpikeWorker,
  SPIKE_BANNER,
} from "../../scripts/pwa/spike/marker.mts";
import {
  firstLoadChunksByRoute,
  SPIKE_SHELL_ROUTES,
  staticUrlOf,
} from "../../scripts/pwa/spike/precache.mts";
import { PUBLIC_ENV_NAMES } from "../../src/lib/env-parse";
import { expect, test as base } from "../fixtures";
import {
  dropOfflineLoadErrors,
  dropOfflineNavigationErrors,
  goOffline,
} from "../support/network";

const PROJECT_DIR = path.resolve(__dirname, "..", "..");
const BUILD_SCRIPT = path.join(PROJECT_DIR, "scripts/pwa/spike/build.mts");
const NEXT_BIN = path.join(PROJECT_DIR, "node_modules/next/dist/bin/next");
const WORKER_FILE = path.join(PROJECT_DIR, "public", "sw.js");

/**
 * True once `npm run build` writes PWA-1's own worker. The spike then
 * retires: its builder refuses to touch that file, and replacing it would
 * hand PWA-1's specs the wrong worker from the shared web server.
 */
function pwa1WorkerExists(): boolean {
  return (
    existsSync(WORKER_FILE) && !isSpikeWorker(readFileSync(WORKER_FILE, "utf8"))
  );
}

interface SpikeServer {
  /** The spike server's origin, such as http://127.0.0.1:41234. */
  readonly origin: string;
  /** Stops the server; calling it again does nothing. */
  stop(): Promise<void>;
}

/** Runs build.mts and returns what it printed, or throws with it. */
function runBuildScript(args: readonly string[]): string {
  const result = spawnSync(process.execPath, [BUILD_SCRIPT, ...args], {
    cwd: PROJECT_DIR,
    encoding: "utf8",
  });
  const log = `${result.stdout}${result.stderr}`.trim();
  if (result.status !== 0) {
    throw new Error(
      `scripts/pwa/spike/build.mts ${args.join(" ")} failed:\n${log}`,
    );
  }
  return log;
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

/** Resolves with the response, or with null when nothing answers. */
async function tryFetch(url: string): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(2_000) });
  } catch {
    return null;
  }
}

/**
 * Takes the lock that lets one spike run at a time, and returns its
 * release. Runs share public/sw.js, which each deletes when it finishes, so
 * two at once (`--repeat-each`, say) would pull the worker from under each
 * other. The lock is a directory in the output directory, which Playwright
 * empties when a run starts, so a crashed run can't leave it behind.
 */
async function lockSpike(outputDir: string): Promise<() => void> {
  const lock = path.join(outputDir, ".pwa-spike.lock");
  mkdirSync(outputDir, { recursive: true });
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      mkdirSync(lock);
      return () => rmSync(lock, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() > deadline) {
        throw new Error(`another spike run has held ${lock} for 90 s`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

interface NextServer extends SpikeServer {
  /** What the server has printed so far. */
  log(): string;
}

/**
 * `next start` on `port`, with the web server's environment
 * (playwright.config.ts), so it serves the very build the web server made.
 * Resolves once it serves /sw.js.
 */
async function startNextServer(
  port: number,
  siteUrl: string,
): Promise<NextServer> {
  const origin = `http://127.0.0.1:${port}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...Object.fromEntries(PUBLIC_ENV_NAMES.map((name) => [name, ""])),
    NEXT_PUBLIC_BACKEND_MODE: "mock",
    NEXT_PUBLIC_SITE_URL: siteUrl,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
  };
  const child = spawn(
    process.execPath,
    [NEXT_BIN, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    // Its own process group, so stop() reaches anything it starts.
    {
      cwd: PROJECT_DIR,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const record = (chunk: Buffer) => {
    output += chunk.toString();
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
  });
  const signal = (name: NodeJS.Signals) => {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, name);
    } catch {
      // It has already exited.
    }
  };

  let stopped = false;
  const server: NextServer = {
    origin,
    log: () => output,
    async stop() {
      if (stopped) return;
      stopped = true;
      if (child.exitCode === null && child.signalCode === null) {
        signal("SIGTERM");
        const kill = setTimeout(() => signal("SIGKILL"), 5_000);
        await exited;
        clearTimeout(kill);
      }
    },
  };

  const deadline = Date.now() + 60_000;
  while ((await tryFetch(`${origin}/sw.js`))?.ok !== true) {
    if (child.exitCode !== null || Date.now() > deadline) {
      await server.stop();
      throw new Error(`next start did not come up on ${origin}:\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return server;
}

const test = base.extend<{ spike: SpikeServer }>({
  spike: [
    async ({ baseURL }, provide, testInfo) => {
      testInfo.skip(
        pwa1WorkerExists(),
        "public/sw.js is PWA-1's worker, so the spike is retired: delete scripts/pwa/spike and e2e/pwa/spike.spec.ts.",
      );
      const release = await lockSpike(testInfo.project.outputDir);
      let buildLog = "";
      let server: NextServer | undefined;
      try {
        buildLog = runBuildScript([]);
        const started = await startNextServer(await freePort(), baseURL ?? "");
        server = started;
        await provide({ origin: started.origin, stop: () => started.stop() });
      } finally {
        await server?.stop();
        try {
          runBuildScript(["--clean"]);
        } finally {
          release();
        }
        if (testInfo.status !== testInfo.expectedStatus) {
          await testInfo.attach("serwist-build.log", {
            body: buildLog,
            contentType: "text/plain",
          });
          await testInfo.attach("next-start.log", {
            body: server?.log() ?? "",
            contentType: "text/plain",
          });
        }
      }
    },
    { timeout: 120_000 },
  ],
});

const round = (page: Page) => page.locator('[data-round="choice"]');
const stem = (page: Page) => round(page).getByRole("heading", { level: 1 });
const options = (page: Page) =>
  round(page).locator("[data-question] ol").getByRole("button");
const continueButton = (page: Page) =>
  round(page).getByRole("button", {
    name: /^(Next question|See your results)$/,
  });

/**
 * Picks an option, waits for its verdict, taps the question to complete the
 * reveal, then continues (as e2e/practice/greybox.spec.ts does).
 */
async function answerAndContinue(page: Page, option: number) {
  await options(page).nth(option).click();
  await expect(options(page).nth(option)).toHaveAttribute(
    "data-state",
    /^(correct|your-answer)$/,
  );
  await stem(page).click();
  await expect(round(page).getByRole("region")).toBeVisible();
  await continueButton(page).click();
}

/** Registers /sw.js and waits until it is active, so its precache is complete. */
async function registerWorker(page: Page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    const worker =
      registration.installing ?? registration.waiting ?? registration.active;
    if (worker === null) throw new Error("the registration has no worker");
    await new Promise<void>((resolve, reject) => {
      const settle = () => {
        if (worker.state === "activated") resolve();
        // Install fails when any precache request does.
        if (worker.state === "redundant")
          reject(new Error("the worker failed to install"));
      };
      worker.addEventListener("statechange", settle);
      setTimeout(
        () =>
          reject(new Error(`the worker is still ${worker.state} after 30 s`)),
        30_000,
      );
      settle();
    });
    return { scope: registration.scope, state: worker.state };
  });
}

/** Every cache entry's URL, without Serwist's revision parameter. */
async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        urls.push(request.url.replace(/[?&]__WB_REVISION__=[^&]*$/, ""));
      }
    }
    return urls;
  });
}

/**
 * Fetches `url` from the page while Playwright answers it, and reports
 * whether the worker answered it instead. A request the worker leaves alone
 * reaches Playwright's routing as the page's own; one it answered would not.
 */
async function probe(page: Page, url: string) {
  let routed = false;
  await page.route(url, async (route) => {
    routed = true;
    await route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    });
  });
  const response = page.waitForResponse(url);
  await page.evaluate(async (target) => {
    await fetch(target);
  }, url);
  const fromServiceWorker = (await response).fromServiceWorker();
  await page.unroute(url);
  return { routed, fromServiceWorker };
}

/**
 * probe() for another origin's `url`, from a page under the worker in a
 * context of its own that bypasses the page's Content Security Policy:
 * connect-src 'self' (SEC-1) refuses the fetch before the worker could see
 * it. The rest of the spike runs under the real policy. This context keeps
 * the guards the test's own has: nothing but the probe leaves the spike's
 * origin, and the page logs no error.
 */
async function probeOtherOrigin(browser: Browser, origin: string, url: string) {
  const context = await browser.newContext({
    bypassCSP: true,
    serviceWorkers: "allow",
  });
  const errors: string[] = [];
  const blocked: string[] = [];
  try {
    // probe() routes `url` on the page, which wins over this route.
    await context.route(
      (target) => target.origin !== origin,
      async (route) => {
        blocked.push(route.request().url());
        await route.abort("blockedbyclient");
      },
    );
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${origin}/practice/run`);
    await registerWorker(page);
    // The worker claims no open page (clientsClaim: false): a reload puts
    // this one under it.
    await page.reload();
    const controlled = await page.evaluate(
      () => navigator.serviceWorker.controller !== null,
    );
    return { controlled, ...(await probe(page, url)), errors, blocked };
  } finally {
    await context.close();
  }
}

test.describe("the service-worker spike", () => {
  test.describe.configure({ timeout: 120_000 });

  test("after one online visit, /practice/run plays offline to its results from the spike worker's precache", async ({
    browser,
    page,
    spike,
    consoleErrors,
  }) => {
    const { origin } = spike;
    let firstQuestion = "";

    await test.step("next start serves the worker that serwist build wrote after next build", async () => {
      const response = await fetch(`${origin}/sw.js`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(
        /^(application|text)\/javascript/,
      );
      expect((await response.text()).startsWith(SPIKE_BANNER)).toBe(true);
    });

    await test.step("the first visit registers the worker, which precaches the practice shell", async () => {
      await page.goto(`${origin}/practice/run`);
      await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
      firstQuestion = (await stem(page).textContent()) ?? "";
      expect(firstQuestion).not.toBe("");

      expect(await registerWorker(page)).toEqual({
        scope: `${origin}/`,
        state: "activated",
      });

      const cached = await cachedUrls(page);
      for (const shell of SPIKE_SHELL_ROUTES) {
        expect(cached).toContain(`${origin}${shell}`);
      }
      // Everything the visit loaded from /_next/static/, the lazy fixture
      // pack included, is precached: the chunk walk missed nothing. Other
      // routes' first-load chunks are the exception. The router fetches
      // them when it prefetches a link on the page (the run's Leave link to
      // Today), and the spike precaches the practice shell only.
      const loaded = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) =>
            new URL(name).pathname.startsWith("/_next/static/"),
          ),
      );
      expect(loaded.length).toBeGreaterThan(0);
      const otherRoutesChunks = new Set<string>();
      for (const [route, chunks] of firstLoadChunksByRoute(PROJECT_DIR)) {
        if (SPIKE_SHELL_ROUTES.includes(route)) continue;
        for (const chunk of chunks) {
          otherRoutesChunks.add(`${origin}${staticUrlOf(chunk)}`);
        }
      }
      const notCached = loaded.filter((url) => !cached.includes(url));
      expect(notCached.filter((url) => !otherRoutesChunks.has(url))).toEqual(
        [],
      );
      test.info().annotations.push({
        type: "prefetched for links, not precached",
        description:
          notCached.map((url) => new URL(url).pathname).join(", ") || "none",
      });
    });

    await test.step("online, the worker answers navigations and leaves /api/* and other origins to the network", async () => {
      const response = await page.reload();
      expect(response?.fromServiceWorker()).toBe(true);
      expect(
        await page.evaluate(() => navigator.serviceWorker.controller !== null),
      ).toBe(true);
      await expect(stem(page)).toHaveText(firstQuestion);

      // Rule 1 of §10.7: never /api/* or another origin (AC-PWA-03's mechanism).
      expect(await probe(page, `${origin}/api/pwa-spike-probe`)).toEqual({
        routed: true,
        fromServiceWorker: false,
      });
      expect(
        await probeOtherOrigin(
          browser,
          origin,
          "https://pwa-spike-probe.invalid/rpc",
        ),
      ).toEqual({
        controlled: true,
        routed: true,
        fromServiceWorker: false,
        errors: [],
        blocked: [],
      });
    });

    await test.step("offline, with its server stopped, the run reloads from the precache and plays to its results", async () => {
      // Offline first, then stop the server. The other way round, a request
      // the page sends in between (the router's idle prefetch of Today's
      // chunks, which the spike doesn't precache) meets a closed port and
      // logs net::ERR_CONNECTION_REFUSED instead of the offline error that
      // dropOfflineLoadErrors expects.
      await goOffline(page);
      await spike.stop();
      expect(await tryFetch(`${origin}/sw.js`)).toBeNull();

      const response = await page.reload();
      expect(response?.fromServiceWorker()).toBe(true);
      expect(response?.status()).toBe(200);
      // The run resumes where it was (ARCHITECTURE §4.5, invariant 8).
      await expect(round(page).getByText("Question 1 of 10")).toBeVisible();
      await expect(stem(page)).toHaveText(firstQuestion);

      for (let question = 1; question <= 10; question += 1) {
        await expect(
          round(page).getByText(`Question ${question} of 10`),
        ).toBeVisible();
        await answerAndContinue(page, question % 2);
      }
      // The client navigation can't fetch its RSC payload, so Next loads the
      // page in full, and the worker answers with the precached shell.
      await expect(page).toHaveURL(`${origin}/practice/results`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        /^Practice done\. \d+ out of 10\.$/,
      );
      await expect(page.locator("[data-result-row]")).toHaveCount(10);

      // Offline, Next logs its navigation fallback, and Chromium logs each
      // request the network refused (link prefetches): those, and only those.
      const fallbacks = dropOfflineNavigationErrors(consoleErrors);
      const refused = dropOfflineLoadErrors(consoleErrors);
      test.info().annotations.push({
        type: "expected offline console errors",
        description: `${fallbacks} RSC navigation fallback(s), ${refused} refused load(s)`,
      });
    });
  });
});
