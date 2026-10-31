import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

import { PUBLIC_ENV_NAMES } from "./src/lib/env-parse";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Vite 8 resolves the "@/*" alias from tsconfig.json natively.
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    // Unit tests live next to the code they test, as *.test.ts(x) or
    // *.spec.ts(x). Playwright specs in e2e/ use a different runner and must
    // never be collected here, which the src/ prefix guarantees.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
    setupFiles: ["./vitest.setup.ts"],
    // Unit tests never talk to a real backend, and must not depend on
    // whatever is exported in the shell. Blank values count as unset in
    // src/lib/env.ts.
    env: {
      ...Object.fromEntries(PUBLIC_ENV_NAMES.map((name) => [name, ""])),
      NEXT_PUBLIC_BACKEND_MODE: "mock",
    },
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
