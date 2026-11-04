import { defineConfig, devices } from "@playwright/test";

import { PUBLIC_ENV_NAMES } from "./src/lib/env-parse";

/**
 * The real-backend E2E job (ARCHITECTURE §11.7): the app built against the
 * real Supabase project, played by Chromium on a GitHub runner, which can
 * reach Supabase where the sandbox can't. `npm run test:e2e:real`.
 *
 * A skeleton: CI-0 completes it with e2e-real/fixtures.ts (which allows
 * zcodouduyvxwefxebvmv.supabase.co over https and wss, and nothing else),
 * the first spec and e2e-real.yml. Every spec plays as a test identity
 * (`e2e2e2e2-` ids, §8.17) on the e2e content track, so no run touches
 * real statistics or shows real sealed content in a public CI artifact.
 */

const PORT = readPort(process.env.E2E_PORT, 3200);
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

export default defineConfig({
  testDir: "./e2e-real",
  outputDir: "./test-results/real",
  // One test at a time against the one real project, so rate limits and
  // shared state never make results depend on scheduling (§11.7).
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/real" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "real-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 300_000,
    env: {
      // The built-in public URL and publishable key of the real project:
      // nothing from the shell, and no secret (§11.7).
      ...Object.fromEntries(PUBLIC_ENV_NAMES.map((name) => [name, ""])),
      NEXT_PUBLIC_BACKEND_MODE: "supabase",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
