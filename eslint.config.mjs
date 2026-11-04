import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const ROOT = import.meta.dirname;

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/**
 * Test code may reach across layers to set up state: the layer rules of
 * ARCHITECTURE §2.2 govern the code that ships. Engine tests still keep the
 * engine's purity rules.
 */
const TEST_FILES = [
  "**/*.{test,spec}.{ts,tsx,mts}",
  "**/__fixtures__/**",
  "src/test/**",
];

/**
 * Public env vars are inlined at build time and need shared fallbacks, so
 * they are only read in src/lib/env.ts. Next.js only inlines literal
 * process.env.NAME reads: a dynamic lookup or an alias of process.env is
 * silently undefined in the browser.
 */
const ENV_ACCESS_SELECTORS = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^NEXT_PUBLIC_/]",
    message:
      "Read public config through @/lib/env so it stays typed and crash-proof.",
  },
  {
    // process.env[name], process.env["NEXT_PUBLIC_X"]
    selector:
      "MemberExpression[computed=true][object.type='MemberExpression'][object.object.name='process'][object.property.name='env']",
    message:
      "Next.js does not inline dynamic process.env[...] lookups, so they are undefined in the browser. Read public config through @/lib/env.",
  },
  {
    // const env = process.env; const { X } = process.env; f(process.env)
    selector:
      "MemberExpression[object.name='process'][property.name='env']:not(MemberExpression > MemberExpression.object)",
    message:
      "Next.js only inlines literal process.env.NAME reads, so aliased or destructured process.env is undefined in the browser. Read public config through @/lib/env.",
  },
];

/** No zod in the browser (ARCHITECTURE §10.9): it belongs to src/content/schema, scripts and tests. */
const NO_ZOD = {
  name: "zod",
  message:
    "zod is build-time only (ARCHITECTURE §10.9): src/content/schema, scripts and tests use it. Browser code validates with small hand-written decoders.",
};
const NO_REACT_PATHS = ["react", "react-dom", "next"].map((name) => ({
  name,
  message: `This layer has no ${name === "next" ? "Next" : "React"} code (ARCHITECTURE §2.2).`,
}));
const NO_REACT_PATTERNS = [
  {
    group: ["react/*", "react-dom/*", "next/*"],
    message: "This layer has no React or Next code (ARCHITECTURE §2.2).",
  },
];

// ---------------------------------------------------------------------------
// Engine purity (ARCHITECTURE §2.2, §4.1)
// ---------------------------------------------------------------------------

const ENGINE_IS_PURE =
  "src/engine is pure TypeScript (ARCHITECTURE §4.1): functions take data and return data.";

/** Globals the engine never touches, with the reason for each group. */
const ENGINE_GLOBALS = [
  [
    `${ENGINE_IS_PURE} No DOM, storage or network: pass the data in.`,
    [
      "window",
      "self",
      "globalThis",
      "document",
      "navigator",
      "location",
      "history",
      "screen",
      "visualViewport",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "caches",
      "cookieStore",
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "BroadcastChannel",
      "Worker",
      "SharedWorker",
      "MessageChannel",
      "postMessage",
      "alert",
      "confirm",
      "prompt",
      "matchMedia",
      "getComputedStyle",
      "addEventListener",
      "removeEventListener",
      "dispatchEvent",
      "Event",
      "CustomEvent",
      "EventTarget",
      "HTMLElement",
      "Element",
      "MutationObserver",
      "ResizeObserver",
      "IntersectionObserver",
      "Image",
      "Audio",
      "AudioContext",
      "Notification",
      "Blob",
      "File",
      "FileReader",
      "FormData",
    ],
  ],
  [
    `${ENGINE_IS_PURE} No timers: time arrives as \`at\` on events or through an injected Clock (§4.3).`,
    [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "queueMicrotask",
      "performance",
    ],
  ],
  [
    `${ENGINE_IS_PURE} Randomness comes through an injected Rng (§4.2).`,
    ["crypto"],
  ],
  [
    `${ENGINE_IS_PURE} It runs in the browser as well as in Node: no Node globals.`,
    ["process", "Buffer", "global", "require", "__dirname", "__filename"],
  ],
].flatMap(([message, names]) => names.map((name) => ({ name, message })));

const ENGINE_PROPERTIES = [
  {
    object: "Date",
    property: "now",
    message: `${ENGINE_IS_PURE} Date.now() is a hidden input: take \`at\` or an injected Clock (§4.3).`,
  },
  {
    object: "Math",
    property: "random",
    message: `${ENGINE_IS_PURE} Math.random() is a hidden input: use an injected Rng (§4.2).`,
  },
];

const ENGINE_SYNTAX = [
  ...ENV_ACCESS_SELECTORS,
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: `${ENGINE_IS_PURE} new Date() without an argument reads the clock: take \`at\` or an injected Clock (§4.3).`,
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: `${ENGINE_IS_PURE} Date() returns the current time: take \`at\` or an injected Clock (§4.3).`,
  },
];

/** Engine source only: tests may load modules lazily. */
const NO_DYNAMIC_IMPORT = {
  selector: "ImportExpression",
  message: `${ENGINE_IS_PURE} No dynamic imports: import engine modules statically, so scripts/ can run them in Node.`,
};

/** Node runs engine and schema modules from scripts/ directly, so a JSON import needs its attribute there. */
const NODE_RUNNABLE_SYNTAX = {
  selector:
    "ImportDeclaration[source.value=/\\.json$/]:not(:has(ImportAttribute))",
  message:
    'Node runs this module from scripts/ without a bundler (ARCHITECTURE §2.2), so a JSON import needs `with { type: "json" }`.',
};

/** Relative imports with an explicit extension, so Node 22 runs the file without a build step (§2.2). */
const RELATIVE_WITH_EXTENSION = {
  regex: "^\\.{1,2}/.*(?<!\\.ts|\\.json)$",
  message:
    "Import engine and schema modules by relative path with an explicit .ts extension, so Node 22 runs them from scripts/ without a build step (ARCHITECTURE §2.2).",
};

// ---------------------------------------------------------------------------
// Feature boundaries (ARCHITECTURE §2.2, §2.3)
// ---------------------------------------------------------------------------

const FEATURES_DIR = join(ROOT, "src/features");

const FEATURES = existsSync(FEATURES_DIR)
  ? readdirSync(FEATURES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

/**
 * The extension points of §2.3: files that other features import by path,
 * by contract. Everything else in a feature is reached through its
 * index.ts, or its client.ts for client hooks and components. Every
 * feature's `offers/` folder is an extension point too (the stop-screen
 * offer providers).
 */
const EXTENSION_POINTS = [
  // Reveal actions, share and challenge buttons
  "reports/reveal-actions",
  "share/share-button",
  "challenges/challenge-button",
  // Streak line and chip, and the notices above Practice on Today
  "streaks/stop-screen-line",
  "streaks/chip",
  "streaks/home-notice",
  "identity/home-notice",
  // Home slots
  ...[
    "daily",
    "streaks",
    "practice",
    "review",
    "challenges",
    "groups",
    "archive",
    "rooms",
    "editor",
  ].map((feature) => `${feature}/home-slot`),
  // Stop-screen comparison cards, the Groups row and the Group line
  "challenges/stop-screen-card",
  "share-landing/stop-screen-card",
  "groups/stop-screen-row",
  "groups/home-line",
  // Room host sources
  "editor/share/host-source",
  // Practice hub cards and badges
  "review/card",
  "mastery/badge",
  // Analytics
  "analytics/track",
  "analytics/regret-survey",
  // Nickname copy and field
  "nickname/copy",
  "nickname/nickname-field",
  // Service health
  "incidents/use-health",
  "incidents/banner",
  // Stats sections
  "mastery/stats-section",
  "achievements/summary",
  // Safe points for updates
  "pwa/safe-point",
];

// The zones below match resolved import paths against absolute globs.
// Globs are matched in memory, where a plain path in `except` would be
// resolved again for every file that is linted.

/** ROOT as a literal inside a glob. */
const ROOT_GLOB = ROOT.replace(/[*?[\]{}()!+@\\]/g, "\\$&");
const SRC_GLOB = `${ROOT_GLOB}/src`;
/** Every file under a folder of src/. */
const anyIn = (dir) => `${SRC_GLOB}/${dir}/**`;
/** One module of src/, whichever extension it has. */
const moduleAt = (path) => `${SRC_GLOB}/${path}.{ts,tsx}`;

/** The modules of feature `name` that other features may import. */
function publicEntriesOf(name) {
  return [
    moduleAt(`features/${name}/index`),
    moduleAt(`features/${name}/client`),
    ...EXTENSION_POINTS.filter((point) => point.startsWith(`${name}/`)).map(
      (point) => moduleAt(`features/${point}`),
    ),
    anyIn(`features/${name}/offers`),
  ];
}

/** One zone per feature: another feature's internals are off limits. */
const FEATURE_ZONES = FEATURES.map((name) => ({
  target: `./src/features/${name}`,
  from: [anyIn("features")],
  except: [
    anyIn(`features/${name}`),
    ...FEATURES.filter((other) => other !== name).flatMap(publicEntriesOf),
  ],
  message: `Import another feature only through its index.ts, its client.ts, or an extension point of ARCHITECTURE §2.3 (§2.2).`,
}));

// ---------------------------------------------------------------------------
// Layers (ARCHITECTURE §2.2): what each one may import, by resolved path
// ---------------------------------------------------------------------------

const ANYTHING = [`${ROOT_GLOB}/**`];
const ANYTHING_IN_SRC = [`${SRC_GLOB}/**`];
const PACKAGES = `${ROOT_GLOB}/node_modules/**`;

const LAYER_ZONES = [
  {
    target: "./src/engine",
    from: ANYTHING,
    except: [anyIn("engine"), PACKAGES],
    message: "src/engine imports src/engine only (ARCHITECTURE §2.2).",
  },
  {
    target: "./src/content/schema",
    from: ANYTHING,
    except: [anyIn("content/schema"), anyIn("engine/types"), PACKAGES],
    message:
      "src/content/schema imports zod and src/engine/types only (ARCHITECTURE §2.2).",
  },
  {
    target: [
      "./src/content/loaders",
      "./src/content/generated",
      "./src/content/types.ts",
    ],
    from: ANYTHING_IN_SRC,
    except: [
      anyIn("content/loaders"),
      anyIn("content/generated"),
      moduleAt("content/types"),
      anyIn("engine"),
      anyIn("config"),
    ],
    message:
      "src/content imports the engine and config only (ARCHITECTURE §2.2). src/content/schema and src/content/pipeline are build-time code: only scripts and tests import them.",
  },
  {
    target: "./src/backend",
    from: ANYTHING_IN_SRC,
    except: [
      anyIn("backend"),
      anyIn("engine"),
      anyIn("content/loaders"),
      anyIn("content/generated"),
      moduleAt("content/types"),
      anyIn("config"),
      moduleAt("lib/env"),
      moduleAt("lib/env-parse"),
      anyIn("lib/supabase"),
      moduleAt("platform/server-clock"),
      moduleAt("platform/identity/provider"),
      moduleAt("analytics/dictionary"),
    ],
    message:
      "src/backend imports the engine, content, config, @/lib/env, @/lib/supabase, @/platform/server-clock, and types from @/platform/identity and @/analytics/dictionary (ARCHITECTURE §2.2).",
  },
  {
    target: "./src/platform",
    from: ANYTHING_IN_SRC,
    except: [
      anyIn("platform"),
      anyIn("engine"),
      anyIn("config"),
      moduleAt("lib/env"),
      moduleAt("lib/env-parse"),
      anyIn("analytics"),
      moduleAt("backend/types"),
    ],
    message:
      "src/platform imports the engine, config, @/lib/env and types from analytics and @/backend/types; never features, ui or a backend implementation (ARCHITECTURE §2.2).",
  },
  {
    target: "./src/ui",
    from: ANYTHING_IN_SRC,
    except: [anyIn("ui"), anyIn("config")],
    message:
      "src/ui holds design-system primitives: React and config only, no data, no backend (ARCHITECTURE §2.2).",
  },
  {
    target: "./src/features",
    from: ANYTHING_IN_SRC,
    except: [
      anyIn("features"),
      anyIn("engine"),
      moduleAt("backend/index"),
      moduleAt("backend/types"),
      anyIn("content/loaders"),
      anyIn("content/generated"),
      moduleAt("content/types"),
      anyIn("platform"),
      anyIn("ui"),
      anyIn("analytics"),
      anyIn("config"),
      moduleAt("lib/env"),
      moduleAt("lib/metadata"),
    ],
    message:
      "Features import the engine, @/backend (its index and types only), content, platform, ui, analytics, config, @/lib/env and @/lib/metadata (ARCHITECTURE §2.2).",
  },
  {
    target: "./src/app",
    from: ANYTHING_IN_SRC,
    except: [
      anyIn("app"),
      anyIn("ui"),
      moduleAt("lib/env"),
      `${SRC_GLOB}/features/**/routes/**`,
    ],
    message:
      "src/app holds routes only: it re-exports feature route modules (@/features/*/routes/*) and may use ui and @/lib/env (ARCHITECTURE §2.2).",
  },
  {
    target: "./src/pwa",
    from: ANYTHING,
    except: [
      anyIn("pwa"),
      anyIn("config"),
      moduleAt("content/generated/manifest"),
      PACKAGES,
    ],
    message:
      "src/pwa runs inside the service worker: config and the generated content manifest only (ARCHITECTURE §2.2).",
  },
];

// ---------------------------------------------------------------------------
// A feature's index.ts never pulls in a "use client" module (§2.2)
// ---------------------------------------------------------------------------

const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;
const clientModules = new Map();

function isClientModule(file) {
  let client = clientModules.get(file);
  if (client === undefined) {
    client = USE_CLIENT.test(readFileSync(file, "utf8").replace(/^﻿/, ""));
    clientModules.set(file, client);
  }
  return client;
}

function resolveLocalModule(fromDir, source) {
  let base;
  if (source.startsWith("./") || source.startsWith("../")) {
    base = resolve(fromDir, source);
  } else if (source.startsWith("@/")) {
    base = join(ROOT, "src", source.slice(2));
  } else {
    return null;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return (
    candidates.find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    ) ?? null
  );
}

const qzPlugin = {
  meta: { name: "qz" },
  rules: {
    "no-client-in-barrel": {
      meta: {
        type: "problem",
        docs: {
          description:
            'A feature\'s index.ts never imports or re-exports a "use client" module (ARCHITECTURE §2.2).',
        },
        messages: {
          client:
            '"{{source}}" is a "use client" module. A route whose server code imports this index would carry it in its first load, used or not: export it from the feature\'s client.ts instead (ARCHITECTURE §2.2).',
        },
        schema: [],
      },
      create(context) {
        const dir = dirname(context.physicalFilename);
        function check(node) {
          if (node.source === null || node.source === undefined) return;
          if (node.importKind === "type" || node.exportKind === "type") return;
          const specifiers = node.specifiers ?? [];
          const typeOnly =
            specifiers.length > 0 &&
            specifiers.every(
              (specifier) =>
                specifier.importKind === "type" ||
                specifier.exportKind === "type",
            );
          if (typeOnly) return;
          const source = String(node.source.value);
          const file = resolveLocalModule(dir, source);
          if (file !== null && isClientModule(file)) {
            context.report({
              node: node.source,
              messageId: "client",
              data: { source },
            });
          }
        }
        return {
          ImportDeclaration: check,
          ExportNamedDeclaration: check,
          ExportAllDeclaration: check,
        };
      },
    },
  },
};

// ---------------------------------------------------------------------------
// The config
// ---------------------------------------------------------------------------

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Rules that need type information. They catch real async bugs, such as
    // an un-awaited Playwright assertion or a promise passed to onClick.
    name: "project/type-aware",
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: ROOT,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    name: "project/env-access",
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/env.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...ENV_ACCESS_SELECTORS],
    },
  },

  // --- Layer rules (ARCHITECTURE §2.2) -------------------------------------
  // Each layer block sets @typescript-eslint/no-restricted-imports for its
  // own files, which never overlap, because a later block's options replace
  // an earlier one's. The resolved-path zones below catch what a specifier
  // can't show: relative paths across layers and dynamic imports.
  {
    name: "layers/paths",
    files: ["src/**/*.{ts,tsx,mts}"],
    ignores: TEST_FILES,
    rules: {
      "import/no-restricted-paths": [
        "error",
        { basePath: ROOT, zones: [...LAYER_ZONES, ...FEATURE_ZONES] },
      ],
    },
  },
  {
    name: "layers/engine",
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", ...ENGINE_GLOBALS],
      "no-restricted-properties": ["error", ...ENGINE_PROPERTIES],
      "no-restricted-syntax": ["error", ...ENGINE_SYNTAX],
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Tests may also use the test runner and Node built-ins.
              regex: "^(?!\\.{1,2}/|vitest$|node:)",
              message: `${ENGINE_IS_PURE} It imports other engine modules only, by relative path: no React, Next, zod, packages or @/ layers (§2.2).`,
            },
            RELATIVE_WITH_EXTENSION,
          ],
        },
      ],
    },
  },
  {
    name: "layers/engine-source",
    files: ["src/engine/**/*.ts"],
    ignores: TEST_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ENGINE_SYNTAX,
        NO_DYNAMIC_IMPORT,
        NODE_RUNNABLE_SYNTAX,
      ],
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.{1,2}/)",
              message: `${ENGINE_IS_PURE} It imports other engine modules only, by relative path: no React, Next, zod, Node built-ins, packages or @/ layers (§2.2).`,
            },
            RELATIVE_WITH_EXTENSION,
          ],
        },
      ],
    },
  },
  {
    name: "layers/content-schema",
    files: ["src/content/schema/**/*.ts"],
    ignores: TEST_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ENV_ACCESS_SELECTORS,
        NODE_RUNNABLE_SYNTAX,
      ],
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.{1,2}/|zod$)",
              message:
                "src/content/schema imports zod and src/engine/types only, by relative path (ARCHITECTURE §2.2).",
            },
            RELATIVE_WITH_EXTENSION,
          ],
        },
      ],
    },
  },
  {
    name: "layers/content",
    files: [
      "src/content/loaders/**/*.ts",
      "src/content/generated/**/*.ts",
      "src/content/types.ts",
    ],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [...NO_REACT_PATHS, NO_ZOD],
          patterns: NO_REACT_PATTERNS,
        },
      ],
    },
  },
  {
    name: "layers/backend",
    files: ["src/backend/**/*.{ts,tsx}"],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [...NO_REACT_PATHS, NO_ZOD],
          patterns: [
            ...NO_REACT_PATTERNS,
            {
              group: ["@/analytics", "@/analytics/**"],
              allowTypeImports: true,
              message:
                "src/backend takes types only from @/analytics/dictionary (ARCHITECTURE §2.2).",
            },
          ],
        },
      ],
    },
  },
  {
    name: "layers/platform",
    files: ["src/platform/**/*.{ts,tsx}"],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [...NO_REACT_PATHS, NO_ZOD],
          patterns: [
            ...NO_REACT_PATTERNS,
            {
              group: [
                "@/analytics",
                "@/analytics/**",
                "@/backend",
                "@/backend/**",
              ],
              allowTypeImports: true,
              message:
                "src/platform takes types only from analytics and @/backend: a backend implementation would make every adapter carry it (ARCHITECTURE §2.2, §2.3).",
            },
          ],
        },
      ],
    },
  },
  {
    name: "layers/ui",
    files: ["src/ui/**/*.{ts,tsx}"],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next",
              message:
                "src/ui imports React and config only (ARCHITECTURE §2.2).",
            },
            NO_ZOD,
          ],
          patterns: [
            {
              group: ["next/*"],
              message:
                "src/ui imports React and config only (ARCHITECTURE §2.2). Routing belongs to features.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "layers/features-and-app",
    files: ["src/features/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [NO_ZOD] },
      ],
    },
  },
  {
    name: "layers/pwa",
    files: ["src/pwa/**/*.ts"],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [...NO_REACT_PATHS, NO_ZOD],
          patterns: NO_REACT_PATTERNS,
        },
      ],
    },
  },
  {
    name: "layers/feature-barrels",
    files: ["src/features/*/index.{ts,tsx}"],
    plugins: { qz: qzPlugin },
    rules: {
      "qz/no-client-in-barrel": "error",
    },
  },

  // Turns off stylistic rules that would fight Prettier. Keep it last.
  prettier,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tool output and docs owned by other teams:
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "docs/**",
  ]),
]);

export default eslintConfig;
