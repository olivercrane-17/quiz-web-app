import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * The projects (ARCHITECTURE §11.1):
 *
 * - `unit`: everything under src/ outside the engine, in jsdom, plus the
 *   tests of the scripts. Files that need Node say so with a
 *   `// @vitest-environment node` docblock (the content pipeline does).
 * - `engine`: src/engine, in Node, as the engine runs in scripts/ and the
 *   SQL parity generator. Its coverage is held to 95% of lines and 90% of
 *   branches (§4.1): `npm run test:coverage`.
 * - `bench`: timing budgets (`*.bench.test.ts`, such as the suggestion
 *   benchmark's 4 ms), in Node. They time uninstrumented code, so the
 *   coverage run, which instruments the engine, leaves them out.
 * - `contract-real`: the backend contract suites against the real Supabase
 *   project (`*.real.test.ts`, §7.5). Only the backend-contract workflow
 *   runs it, with QZ_REAL_BACKEND=1 (`npm run test:contract:real`); the
 *   suites skip themselves without it, and `npm test` leaves it out.
 */

const BENCHMARKS = "src/**/*.bench.test.ts";
const REAL_BACKEND_TESTS = "src/**/*.real.test.ts";

/**
 * Unit tests never talk to a real backend and must not depend on whatever
 * is exported in the shell, so every public variable the shell sets is
 * blanked (blank counts as unset in src/lib/env.ts).
 */
const blankPublicEnv = Object.fromEntries(
  Object.keys(process.env)
    .filter((name) => name.startsWith("NEXT_PUBLIC_"))
    .map((name) => [name, ""]),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Vite 8 resolves the "@/*" alias from tsconfig.json natively.
    tsconfigPaths: true,
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
    env: { ...blankPublicEnv, NEXT_PUBLIC_BACKEND_MODE: "mock" },
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      // The lint refuses engine files that aren't plain .ts; .tsx is here
      // too, so one that got past it would still be measured.
      include: ["src/engine/**/*.{ts,tsx}"],
      exclude: ["src/engine/**/*.{test,spec,bench}.{ts,tsx}"],
      reporter: ["text-summary", "html"],
      thresholds: { lines: 95, branches: 90 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          // Unit tests live next to the code they test, as *.test.ts(x) or
          // *.spec.ts(x); the lint config's own test sits beside it at the
          // root. Playwright specs in e2e/ use a different runner and must
          // never be collected here, which the prefixes guarantee.
          include: [
            "src/**/*.{test,spec}.{ts,tsx}",
            "scripts/**/*.test.{ts,mts}",
            "eslint.config.test.ts",
          ],
          exclude: [
            ...configDefaults.exclude,
            "src/engine/**",
            BENCHMARKS,
            REAL_BACKEND_TESTS,
          ],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "engine",
          environment: "node",
          // The unit project leaves src/engine out entirely, so every
          // engine test, .tsx included, is collected here.
          include: ["src/engine/**/*.{test,spec}.{ts,tsx}"],
          exclude: [...configDefaults.exclude, BENCHMARKS],
        },
      },
      {
        extends: true,
        test: {
          name: "bench",
          environment: "node",
          include: [BENCHMARKS],
        },
      },
      {
        extends: true,
        test: {
          name: "contract-real",
          environment: "node",
          include: [REAL_BACKEND_TESTS],
          // The real project, with its built-in public URL and key.
          env: { NEXT_PUBLIC_BACKEND_MODE: "supabase" },
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
