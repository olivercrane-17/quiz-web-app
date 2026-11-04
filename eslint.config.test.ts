// @vitest-environment node
/**
 * The layer rules of eslint.config.mjs (ARCHITECTURE §2.2, §4.1), checked
 * on fixtures: each one lints a few lines of code as if they lived at a
 * path in src/, with the real config. Type information is switched off,
 * because these files exist only in memory and the layer rules never need
 * it.
 */
import { ESLint, type Linter } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfig: [
      {
        files: ["**/*.{ts,tsx,mts,cts}"],
        languageOptions: { parserOptions: { projectService: false } },
        rules: {
          "@typescript-eslint/await-thenable": "off",
          "@typescript-eslint/no-floating-promises": "off",
          "@typescript-eslint/no-misused-promises": "off",
        },
      },
    ],
  });
  // Loading the config and its plugins is the slow part: do it once here.
  await eslint.lintText("export {};\n", { filePath: "src/engine/warm-up.ts" });
}, 60_000);

/** What ESLint reports for `code` at `path`, in order. */
async function messagesAt(
  path: string,
  code: string,
): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath: path });
  const messages: Linter.LintMessage[] = result?.messages ?? [];
  const fatal = messages.find((message) => message.fatal === true);
  if (fatal !== undefined) throw new Error(`${path}: ${fatal.message}`);
  return messages;
}

/** The rule ids that fire on `code` at `path`, one per message, in order. */
async function rulesFiredAt(path: string, code: string): Promise<string[]> {
  return (await messagesAt(path, code)).map(
    (message) => message.ruleId ?? "(none)",
  );
}

const IMPORTS = "@typescript-eslint/no-restricted-imports";
const PATHS = "import/no-restricted-paths";
const GLOBALS = "no-restricted-globals";
const PROPERTIES = "no-restricted-properties";
const SYNTAX = "no-restricted-syntax";
const BARREL = "qz/no-client-in-barrel";
const TYPE_ONLY = "qz/type-only-imports";

type Case = [label: string, path: string, code: string, fired: string[]];

describe("engine purity (§4.1)", () => {
  it("a lint fixture importing React into src/engine fails", async () => {
    expect(
      await rulesFiredAt(
        "src/engine/scoring/lint-fixture.ts",
        'import { useState } from "react";\nexport const hook = useState;\n',
      ),
    ).toEqual([IMPORTS]);
  });

  it.each<Case>([
    [
      "React in a .tsx file",
      "src/engine/x.tsx",
      'import { useState } from "react";\nexport const hook = useState;\n',
      [SYNTAX, IMPORTS],
    ],
    [
      "the DOM and the network in a .tsx file",
      "src/engine/og/lint-fixture.tsx",
      'export const w = window.innerWidth;\nexport const r = fetch("/x");\n',
      [SYNTAX, GLOBALS, GLOBALS],
    ],
    [
      "React and Date.now() in a .mts file",
      "src/engine/lint-fixture.mts",
      'import { useState } from "react";\nexport const hook = useState;\nexport const t = Date.now();\n',
      [SYNTAX, IMPORTS, PROPERTIES],
    ],
    [
      "React and Date.now() in a .js file",
      "src/engine/lint-fixture.js",
      'import { useState } from "react";\nexport const hook = useState;\nexport const t = Date.now();\n',
      [SYNTAX, IMPORTS, PROPERTIES],
    ],
    [
      "a .tsx test",
      "src/engine/og/lint-fixture.test.tsx",
      'import { it } from "vitest";\nit("renders", () => {});\n',
      [SYNTAX],
    ],
  ])(
    "refuses a module that isn't plain .ts, whatever it holds: %s",
    async (_label, path, code, fired) => {
      expect(await rulesFiredAt(path, code)).toEqual(fired);
    },
  );

  it.each<Case>([
    [
      "Next",
      "src/engine/lint-fixture.ts",
      'import { notFound } from "next/navigation";\nexport const x = notFound;\n',
      [IMPORTS],
    ],
    [
      "zod",
      "src/engine/lint-fixture.ts",
      'import { z } from "zod";\nexport const x = z;\n',
      [IMPORTS],
    ],
    [
      "an @/ layer",
      "src/engine/lint-fixture.ts",
      'import { getKv } from "@/platform/storage";\nexport const x = getKv;\n',
      [IMPORTS, PATHS],
    ],
    [
      "a Node built-in",
      "src/engine/lint-fixture.ts",
      'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n',
      [IMPORTS],
    ],
    [
      "a relative path out of the engine",
      "src/engine/time/lint-fixture.ts",
      'import { env } from "../../lib/env.ts";\nexport const x = env;\n',
      [PATHS],
    ],
    [
      "a relative path without its .ts extension",
      "src/engine/time/lint-fixture.ts",
      'import { addDays } from "./calendar";\nexport const x = addDays;\n',
      [IMPORTS],
    ],
    [
      "a JSON module without its import attribute",
      "src/engine/lint-fixture.ts",
      'import table from "./fixtures/encore.json";\nexport const x = table;\n',
      [SYNTAX],
    ],
    [
      "a dynamic import",
      "src/engine/lint-fixture.ts",
      'export const load = () => import("./rng.ts");\n',
      [SYNTAX],
    ],
  ])("refuses %s", async (_label, path, code, fired) => {
    expect(await rulesFiredAt(path, code)).toEqual(fired);
  });

  it.each<Case>([
    [
      "Date.now()",
      "src/engine/x.ts",
      "export const t = Date.now();\n",
      [PROPERTIES],
    ],
    [
      "new Date()",
      "src/engine/x.ts",
      "export const t = new Date();\n",
      [SYNTAX],
    ],
    ["Date()", "src/engine/x.ts", "export const t = Date();\n", [SYNTAX]],
    [
      "Math.random()",
      "src/engine/x.ts",
      "export const r = Math.random();\n",
      [PROPERTIES],
    ],
    [
      "crypto.randomUUID()",
      "src/engine/x.ts",
      "export const id = crypto.randomUUID();\n",
      [GLOBALS],
    ],
    [
      "performance.now()",
      "src/engine/x.ts",
      "export const t = performance.now();\n",
      [GLOBALS],
    ],
    ["a timer", "src/engine/x.ts", "setTimeout(() => {}, 1);\n", [GLOBALS]],
    [
      "the DOM",
      "src/engine/x.ts",
      "export const w = window.innerWidth;\n",
      [GLOBALS],
    ],
    [
      "storage",
      "src/engine/x.ts",
      'export const v = localStorage.getItem("qz:x");\n',
      [GLOBALS],
    ],
    [
      "the network",
      "src/engine/x.ts",
      'export const r = fetch("/x");\n',
      [GLOBALS],
    ],
    [
      "the global object",
      "src/engine/x.ts",
      "export const t = globalThis.Date;\n",
      [GLOBALS],
    ],
    [
      "process",
      "src/engine/x.ts",
      "export const mode = process.env.NODE_ENV;\n",
      [GLOBALS],
    ],
    [
      "any browser global, not only the well-known ones",
      "src/engine/x.ts",
      [
        "export const a = innerWidth;",
        "export const b = scrollY;",
        "export const c = new DOMParser();",
        "export const d = getSelection();",
        "export const e = devicePixelRatio;",
        "",
      ].join("\n"),
      [GLOBALS, GLOBALS, GLOBALS, GLOBALS, GLOBALS],
    ],
  ])("refuses %s", async (_label, path, code, fired) => {
    expect(await rulesFiredAt(path, code)).toEqual(fired);
  });

  it("keeps the browser globals whose output depends only on their arguments", async () => {
    expect(
      await rulesFiredAt(
        "src/engine/x.ts",
        [
          'export const url = new URL("/daily", "https://example.com");',
          'export const query = new URLSearchParams("a=1");',
          'export const bytes = new TextEncoder().encode("x");',
          "export const text = new TextDecoder().decode(bytes);",
          "export const copy = structuredClone({ a: 1 });",
          'export const coded = btoa("x") + atob("eA==");',
          "export const controller = new AbortController();",
          'export const months = new Intl.DateTimeFormat("en-US").formatToParts(0);',
          'console.warn("x");',
          "",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("accepts pure code: relative .ts imports, JSON with its attribute, Intl and dates from arguments", async () => {
    expect(
      await rulesFiredAt(
        "src/engine/time/lint-fixture.ts",
        [
          'import { addDays } from "./calendar.ts";',
          'import type { LocalDate } from "../types/ids.ts";',
          'import table from "../fixtures/encore.json" with { type: "json" };',
          "export const parts = (at: number): Intl.DateTimeFormatPart[] =>",
          '  new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).formatToParts(new Date(at));',
          "export const next = (date: LocalDate): LocalDate => addDays(date, 1);",
          "export const rows = table;",
          "",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("lets engine tests use the test runner, Node built-ins, JSON fixtures and lazy imports, and nothing else", async () => {
    expect(
      await rulesFiredAt(
        "src/engine/time/lint-fixture.test.ts",
        [
          'import { readFileSync } from "node:fs";',
          'import { expect, it } from "vitest";',
          'import table from "../fixtures/encore.json";',
          'import { addDays } from "./calendar.ts";',
          'it("works", async () => { expect([readFileSync, table, addDays, await import("./zone.ts")]).toHaveLength(4); });',
          "",
        ].join("\n"),
      ),
    ).toEqual([]);
    expect(
      await rulesFiredAt(
        "src/engine/time/lint-fixture.test.ts",
        'import { render } from "@testing-library/react";\nexport const x = render;\nexport const t = Date.now();\n',
      ),
    ).toEqual([IMPORTS, PROPERTIES]);
  });
});

describe("layer boundaries (§2.2)", () => {
  it.each<Case>([
    // src/content/schema: zod and the engine's types, by relative path.
    [
      "schema → engine types",
      "src/content/schema/lint-fixture.ts",
      'import { z } from "zod";\nimport type { ItemId } from "../../engine/types/ids.ts";\nexport const id = z.string() as unknown as ItemId;\n',
      [],
    ],
    [
      "schema → engine runtime",
      "src/content/schema/lint-fixture.ts",
      'import { createRng } from "../../engine/rng.ts";\nexport const x = createRng;\n',
      [PATHS],
    ],
    [
      "schema → @/ alias",
      "src/content/schema/lint-fixture.ts",
      'import type { ItemId } from "@/engine/types";\nexport type X = ItemId;\n',
      [IMPORTS],
    ],
    [
      "schema → React, from a .tsx file",
      "src/content/schema/lint-fixture.tsx",
      'import { useState } from "react";\nexport const x = useState;\n',
      [SYNTAX, IMPORTS],
    ],
    [
      "schema as a .js file",
      "src/content/schema/lint-fixture.js",
      'import { z } from "zod";\nexport const x = z;\n',
      [SYNTAX],
    ],
    // src/lib, src/analytics, src/config and instrumentation: no row of
    // their own in §2.2, but all of them reach the browser.
    [
      "lib → zod",
      "src/lib/lint-fixture.ts",
      'import { z } from "zod";\nexport const x = z;\n',
      [PATHS],
    ],
    [
      "lib → schema",
      "src/lib/lint-fixture.ts",
      'import { PracticeItemSchema } from "@/content/schema/items";\nexport const x = PracticeItemSchema;\n',
      [PATHS],
    ],
    [
      "lib → the content pipeline",
      "src/lib/lint-fixture.ts",
      'import { loadBank } from "@/content/pipeline/bank";\nexport const x = loadBank;\n',
      [PATHS],
    ],
    [
      "lib → config",
      "src/lib/lint-fixture.ts",
      'import { FEATURE_FLAGS } from "../config/features";\nexport const x = FEATURE_FLAGS;\n',
      [],
    ],
    [
      "analytics → schema",
      "src/analytics/lint-fixture.ts",
      'import { PracticeItemSchema } from "@/content/schema/items";\nexport const x = PracticeItemSchema;\n',
      [PATHS],
    ],
    [
      "config → zod",
      "src/config/lint-fixture.ts",
      'import { z } from "zod";\nexport const x = z;\n',
      [PATHS],
    ],
    [
      "instrumentation-client.ts → zod",
      "src/instrumentation-client.ts",
      'import { z } from "zod";\nexport const x = z;\n',
      [PATHS],
    ],
    // src/content: the engine and config; schema and pipeline are build-time.
    [
      "content loader → schema",
      "src/content/loaders/lint-fixture.ts",
      'import { PracticeItemSchema } from "@/content/schema/items";\nexport const x = PracticeItemSchema;\n',
      [PATHS],
    ],
    [
      "content loader → React",
      "src/content/loaders/lint-fixture.ts",
      'import { useMemo } from "react";\nexport const x = useMemo;\n',
      [IMPORTS],
    ],
    // src/backend
    [
      "backend → server clock, config, content loaders, identity types",
      "src/backend/lint-fixture.ts",
      [
        'import { systemClock } from "@/platform/server-clock";',
        'import { TUNABLES } from "@/config/tunables";',
        'import { loadFixtureDaily } from "@/content/loaders/fixture-daily";',
        'import type { IdentityProvider } from "@/platform/identity/provider";',
        'import type { EventEnvelope } from "@/analytics/dictionary";',
        "export const x = [systemClock, TUNABLES, loadFixtureDaily];",
        "export type Y = [IdentityProvider, EventEnvelope];",
        "",
      ].join("\n"),
      [],
    ],
    [
      "backend → analytics values",
      "src/backend/lint-fixture.ts",
      'import { EVENT_DICTIONARY } from "@/analytics/dictionary";\nexport const x = EVENT_DICTIONARY;\n',
      [TYPE_ONLY],
    ],
    [
      "backend → analytics values, by relative path",
      "src/backend/lint-fixture.ts",
      'import { EVENT_DICTIONARY } from "../analytics/dictionary";\nexport const x = EVENT_DICTIONARY;\n',
      [TYPE_ONLY],
    ],
    [
      "backend → analytics values, loaded lazily",
      "src/backend/mock/lint-fixture.ts",
      'export const load = () => import("../../analytics/dictionary");\n',
      [TYPE_ONLY],
    ],
    [
      "backend → analytics types, by relative path",
      "src/backend/mock/lint-fixture.ts",
      'import type { EventEnvelope } from "../../analytics/dictionary";\nexport type X = EventEnvelope;\n',
      [],
    ],
    [
      "backend → its own analytics adapter",
      "src/backend/supabase/lint-fixture.ts",
      'import { createAnalyticsArea } from "./analytics";\nexport const x = createAnalyticsArea;\n',
      [],
    ],
    [
      "backend → the Supabase SDK, in the Supabase implementation",
      "src/backend/supabase/lint-fixture.ts",
      'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      [],
    ],
    [
      "backend → Serwist",
      "src/backend/lint-fixture.ts",
      'import { Serwist } from "serwist";\nexport const x = Serwist;\n',
      [IMPORTS],
    ],
    [
      "backend → a feature",
      "src/backend/mock/lint-fixture.ts",
      'import { bootClient } from "@/features/identity";\nexport const x = bootClient;\n',
      [PATHS],
    ],
    [
      "backend → platform storage",
      "src/backend/mock/lint-fixture.ts",
      'import { getKv } from "@/platform/storage";\nexport const x = getKv;\n',
      [PATHS],
    ],
    // src/platform
    [
      "platform → backend types",
      "src/platform/lint-fixture.ts",
      'import type { GameBackend } from "@/backend/types";\nexport type X = GameBackend;\n',
      [],
    ],
    [
      "platform → a backend implementation",
      "src/platform/lint-fixture.ts",
      'import { createMockBackend } from "@/backend/mock";\nexport const x = createMockBackend;\n',
      [PATHS, TYPE_ONLY],
    ],
    [
      "platform → analytics values, by relative path",
      "src/platform/identity/lint-fixture.ts",
      'import { EVENT_DICTIONARY } from "../../analytics/dictionary";\nexport const x = EVENT_DICTIONARY;\n',
      [TYPE_ONLY],
    ],
    [
      "platform → ui",
      "src/platform/lint-fixture.ts",
      'import { announce } from "@/ui/announce";\nexport const x = announce;\n',
      [PATHS],
    ],
    [
      "platform → the Supabase SDK",
      "src/platform/lint-fixture.ts",
      'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      [IMPORTS],
    ],
    // src/ui
    [
      "ui → config",
      "src/ui/lint-fixture.tsx",
      'import { TUNABLES } from "@/config/tunables";\nexport const x = TUNABLES;\n',
      [],
    ],
    [
      "ui → Next",
      "src/ui/lint-fixture.tsx",
      'import Link from "next/link";\nexport const x = Link;\n',
      [IMPORTS],
    ],
    [
      "ui → platform",
      "src/ui/lint-fixture.tsx",
      'import { getKv } from "@/platform/storage";\nexport const x = getKv;\n',
      [PATHS],
    ],
    [
      "ui → the Supabase SDK",
      "src/ui/lint-fixture.tsx",
      'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      [IMPORTS],
    ],
    // src/features
    [
      "feature → the backend's index, the engine, platform, ui and @/lib/env",
      "src/features/daily/lint-fixture.ts",
      [
        'import { getBackend } from "@/backend";',
        'import { createRng } from "@/engine/rng";',
        'import { getKv } from "@/platform/storage";',
        'import { announce } from "@/ui/announce";',
        'import { isFeatureEnabled } from "@/lib/env";',
        "export const x = [getBackend, createRng, getKv, announce, isFeatureEnabled];",
        "",
      ].join("\n"),
      [],
    ],
    [
      "feature → the mock backend",
      "src/features/daily/lint-fixture.ts",
      'import { createMockBackend } from "@/backend/mock";\nexport const x = createMockBackend;\n',
      [PATHS],
    ],
    [
      "feature → the mock backend, dynamically",
      "src/features/daily/lint-fixture.ts",
      'export const load = () => import("@/backend/mock");\n',
      [PATHS],
    ],
    [
      "feature → @/lib/supabase",
      "src/features/daily/lint-fixture.ts",
      'import { getBrowserClient } from "@/lib/supabase/browser";\nexport const x = getBrowserClient;\n',
      [PATHS],
    ],
    [
      "feature → zod",
      "src/features/daily/lint-fixture.ts",
      'import { z } from "zod";\nexport const x = z;\n',
      [IMPORTS],
    ],
    [
      "feature → the Supabase SDK",
      "src/features/daily/lint-fixture.ts",
      'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      [IMPORTS],
    ],
    [
      "feature → Serwist",
      "src/features/pwa/lint-fixture.ts",
      'import { Serwist } from "serwist";\nexport const x = Serwist;\n',
      [IMPORTS],
    ],
    [
      "feature → src/app",
      "src/features/daily/lint-fixture.ts",
      'import Layout from "@/app/layout";\nexport const x = Layout;\n',
      [PATHS],
    ],
    // src/app
    [
      "app → a feature route module, ui and @/lib/env",
      "src/app/(play)/lint-fixture/page.tsx",
      'export { default } from "@/features/daily/routes/daily";\nexport { Button } from "@/ui/button";\nexport { getSiteUrl } from "@/lib/env";\n',
      [],
    ],
    [
      "app → a feature's index",
      "src/app/(tabs)/lint-fixture/page.tsx",
      'export { PlayFrame as default } from "@/features/shell";\n',
      [PATHS],
    ],
    [
      "app → the engine",
      "src/app/(tabs)/lint-fixture/page.tsx",
      'import { createRng } from "@/engine/rng";\nexport const x = createRng;\n',
      [PATHS],
    ],
    [
      "app → the Supabase SDK",
      "src/app/(tabs)/lint-fixture/page.tsx",
      'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      [IMPORTS],
    ],
    [
      "app → platform identity, outside a route handler",
      "src/app/(tabs)/lint-fixture/page.tsx",
      'import { decodeLocalIdentity } from "@/platform/identity/local";\nexport const x = decodeLocalIdentity;\n',
      [PATHS],
    ],
    // Route handlers check the identity's formats (§9.3).
    [
      "route handler → platform identity and @/lib/env",
      "src/app/api/identity/route.ts",
      'import { decodeLocalIdentity } from "@/platform/identity/local";\nimport { getSiteUrl } from "@/lib/env";\nexport const x = [decodeLocalIdentity, getSiteUrl];\n',
      [],
    ],
    [
      "route handler → the rest of platform",
      "src/app/api/restore/route.ts",
      'import { getKv } from "@/platform/storage";\nexport const x = getKv;\n',
      [PATHS],
    ],
    [
      "route handler → the engine",
      "src/app/api/identity/route.ts",
      'import { parseSecret } from "@/engine/types";\nexport const x = parseSecret;\n',
      [PATHS],
    ],
    // src/pwa
    [
      "pwa → config and Serwist",
      "src/pwa/lint-fixture.ts",
      'import { Serwist } from "serwist";\nimport { TUNABLES } from "@/config/tunables";\nexport const x = [Serwist, TUNABLES];\n',
      [],
    ],
    [
      "pwa → React",
      "src/pwa/lint-fixture.ts",
      'import { useState } from "react";\nexport const x = useState;\n',
      [IMPORTS],
    ],
    [
      "pwa → React, from a .mts file",
      "src/pwa/lint-fixture.mts",
      'import { useState } from "react";\nexport const x = useState;\n',
      [IMPORTS],
    ],
    [
      "pwa → the Supabase SDK",
      "src/pwa/lint-fixture.ts",
      'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      [IMPORTS],
    ],
    [
      "pwa → a feature's shell table",
      "src/pwa/lint-fixture.ts",
      'import { SHELL_ROUTES } from "@/features/shell/shell-routes";\nexport const x = SHELL_ROUTES;\n',
      [PATHS],
    ],
    [
      "pwa → platform",
      "src/pwa/lint-fixture.ts",
      'import { getKv } from "@/platform/storage";\nexport const x = getKv;\n',
      [PATHS],
    ],
  ])("%s", async (_label, path, code, fired) => {
    expect(await rulesFiredAt(path, code)).toEqual(fired);
  });

  it("lets tests reach across layers to set up state", async () => {
    expect(
      await rulesFiredAt(
        "src/features/daily/lint-fixture.test.ts",
        'import { createMockBackend } from "@/backend/mock";\nimport { getKv } from "@/platform/storage";\nexport const x = [createMockBackend, getKv];\n',
      ),
    ).toEqual([]);
  });

  it("still keeps public config reads in @/lib/env", async () => {
    expect(
      await rulesFiredAt(
        "src/features/daily/lint-fixture.ts",
        "export const url = process.env.NEXT_PUBLIC_SITE_URL;\n",
      ),
    ).toEqual([SYNTAX]);
  });
});

describe("feature boundaries (§2.2, §2.3)", () => {
  it.each<Case>([
    [
      "another feature's index, client entry and extension points",
      "src/features/daily/lint-fixture.ts",
      [
        'import { PRACTICE_COPY } from "@/features/practice";',
        'import { QuickPlayLink } from "@/features/practice/client";',
        'import { StreakChip } from "@/features/streaks/chip";',
        'import { repairOffer } from "@/features/archive/offers/repair";',
        'import { track } from "@/features/analytics/track";',
        "export const x = [PRACTICE_COPY, QuickPlayLink, StreakChip, repairOffer, track];",
        "",
      ].join("\n"),
      [],
    ],
    [
      "its own internals, by alias or relative path",
      "src/features/daily/screen/lint-fixture.ts",
      'import { DAILY_COPY } from "@/features/daily/copy";\nimport { scoreBand } from "../model/labels";\nexport const x = [DAILY_COPY, scoreBand];\n',
      [],
    ],
    [
      "another feature's internals",
      "src/features/daily/lint-fixture.ts",
      'import { createPracticeController } from "@/features/practice/model/controller";\nexport const x = createPracticeController;\n',
      [PATHS],
    ],
    [
      "another feature's internals by relative path",
      "src/features/daily/lint-fixture.ts",
      'import { createPracticeController } from "../practice/model/controller";\nexport const x = createPracticeController;\n',
      [PATHS],
    ],
    [
      "another feature's route module",
      "src/features/daily/lint-fixture.ts",
      'import Run from "@/features/practice/routes/run";\nexport const x = Run;\n',
      [PATHS],
    ],
  ])("%s", async (_label, path, code, fired) => {
    expect(await rulesFiredAt(path, code)).toEqual(fired);
  });

  it('keeps "use client" modules out of a feature\'s index.ts, types aside', async () => {
    expect(
      await rulesFiredAt(
        "src/features/offers/index.ts",
        'export { OfferCard } from "./offer-card";\n',
      ),
    ).toEqual([BARREL]);
    expect(
      await rulesFiredAt(
        "src/features/offers/index.ts",
        'import { OfferCard } from "./offer-card";\nexport const card = OfferCard;\n',
      ),
    ).toEqual([BARREL]);
    expect(
      await rulesFiredAt(
        "src/features/offers/index.ts",
        'export type { OfferCardLayoutProps } from "./offer-card";\nexport { OFFER_PROVIDERS } from "./registry";\n',
      ),
    ).toEqual([]);
    // The client entry is where client modules go.
    expect(
      await rulesFiredAt(
        "src/features/offers/client.ts",
        'export { OfferCard } from "./offer-card";\n',
      ),
    ).toEqual([]);
  });

  it.each<Case>([
    [
      "a name from the client entry",
      "src/features/offers/index.ts",
      'export { OfferCard } from "./client";\n',
      [BARREL],
    ],
    [
      "the whole client entry",
      "src/features/shell/index.ts",
      'export * from "./client";\n',
      [BARREL],
    ],
    [
      "the client entry as a namespace",
      "src/features/practice/index.ts",
      'export * as client from "./client";\n',
      [BARREL],
    ],
    [
      "an import from the client entry, exported again",
      "src/features/shell/index.ts",
      'import { ShellParam } from "./client";\nexport { ShellParam };\n',
      [BARREL],
    ],
  ])(
    'follows re-exports to a "use client" module: %s',
    async (_label, path, code, fired) => {
      expect(await rulesFiredAt(path, code)).toEqual(fired);
    },
  );

  it("names the chain of re-exports that reaches the client module", async () => {
    const [message] = await messagesAt(
      "src/features/offers/index.ts",
      'export { OfferCard } from "./client";\n',
    );

    expect(message?.message).toContain(
      "src/features/offers/client.ts > src/features/offers/offer-card.tsx",
    );
  });

  it("lets types and server modules through the client entry's neighbours", async () => {
    expect(
      await rulesFiredAt(
        "src/features/offers/index.ts",
        'export type { OfferCardLayoutProps } from "./client";\nexport { type OfferCardLayoutProps as Props } from "./client";\n',
      ),
    ).toEqual([]);
    expect(
      await rulesFiredAt(
        "src/features/shell/index.ts",
        'export { SHELL_COPY } from "./copy";\nexport { PlayFrame } from "./play-frame";\nexport { SiteFooter } from "./footer";\n',
      ),
    ).toEqual([]);
  });
});

describe("generated files", () => {
  it.each(["public/sw.js", "public/sw.js.map"])(
    "ignores %s, the service worker that the build writes (§10.7)",
    async (path) => {
      expect(await eslint.isPathIgnored(path)).toBe(true);
    },
  );
});
