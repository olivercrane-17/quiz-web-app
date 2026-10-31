import { defineConfig, devices } from "@playwright/test";

import { PUBLIC_ENV_NAMES } from "./src/lib/env-parse";

const PORT = readPort(process.env.E2E_PORT, 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);

function readPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`E2E_PORT="${raw}" is not a valid port number.`);
  }
  return port;
}

/**
 * E2E tests run against a production build ("next build" + "next start") so
 * they exercise what ships. The build uses the mock backend: no test ever
 * reaches a real network service (e2e/fixtures.ts blocks external requests).
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
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
