import { defineConfig, devices, type Project } from "@playwright/test";

import { PUBLIC_ENV_NAMES } from "./src/lib/env-parse";

const PORT = readPort(process.env.E2E_PORT, 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);

/**
 * WebKit and Firefox join the project list only with E2E_ALL_BROWSERS=1.
 * CI sets it and installs one browser per matrix leg; the sandbox has
 * Chromium alone and never runs `playwright install` (ARCHITECTURE §11.8).
 */
const ALL_BROWSERS = process.env.E2E_ALL_BROWSERS === "1";

/** e2e/pwa/: its specs need the service worker, so pwa-chromium runs them alone. */
const PWA_DIR = /[/\\]e2e[/\\]pwa[/\\]/;
const PWA_SPECS = /[/\\]e2e[/\\]pwa[/\\].*\.spec\.[cm]?[jt]sx?$/;

/**
 * Tests tagged @cdp drive Chromium's DevTools protocol (the accessibility
 * tree, CPU throttling), which WebKit and Firefox don't speak, so those
 * projects leave them out. The behavior such a test proves still runs
 * everywhere through the specs that use it.
 */
const CHROMIUM_PROTOCOL = /@cdp\b/;

function readPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`E2E_PORT="${raw}" is not a valid port number.`);
  }
  return port;
}

/** The browser matrix of ARCHITECTURE §11.8. */
const projects: Project[] = [
  {
    name: "desktop-chromium",
    testIgnore: PWA_DIR,
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "mobile-chromium",
    testIgnore: PWA_DIR,
    use: { ...devices["Pixel 7"] },
  },
  ...(ALL_BROWSERS
    ? [
        {
          name: "mobile-webkit",
          testIgnore: PWA_DIR,
          grepInvert: CHROMIUM_PROTOCOL,
          use: { ...devices["iPhone 15"] },
        },
        {
          name: "desktop-firefox",
          testIgnore: PWA_DIR,
          grepInvert: CHROMIUM_PROTOCOL,
          use: { ...devices["Desktop Firefox"] },
        },
      ]
    : []),
  {
    // The one project that lets the service worker run (PWA-0, PWA-1).
    name: "pwa-chromium",
    testMatch: PWA_SPECS,
    use: { ...devices["Desktop Chrome"], serviceWorkers: "allow" },
  },
];

/**
 * E2E tests run against a production build ("next build" + "next start") so
 * they exercise what ships. The build uses the mock backend: no test ever
 * reaches a real network service (e2e/support/fixtures.ts blocks external
 * requests). The real-backend job has its own config,
 * playwright.real.config.ts.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  // On CI, a run that would outlast its job (30 minutes, setup included)
  // stops here instead, and still prints every failure and writes the
  // report the job uploads. A job that times out loses both.
  globalTimeout: isCI ? 22 * 60_000 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Requests from a service worker bypass Playwright's routing, and with
    // it the external-request guard, so every project but pwa-chromium
    // blocks workers (ARCHITECTURE §11.4).
    serviceWorkers: "block",
  },
  projects,
  webServer: {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    // Off by default: a server that is already listening (another worktree,
    // or a build with a real backend) would be tested in place of this tree,
    // and the run would fail loudly instead. Opt in with E2E_REUSE_SERVER=1.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    // Covers a cold production build on a slow machine.
    timeout: 300_000,
    env: {
      // The build must not depend on the shell, so every public variable
      // starts blank (blank counts as unset in src/lib/env.ts). These values
      // are pinned at build time, so they apply to the build and the server.
      ...Object.fromEntries(PUBLIC_ENV_NAMES.map((name) => [name, ""])),
      NEXT_PUBLIC_BACKEND_MODE: "mock",
      // Metadata and share links must point at the server under test.
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
