import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import ts from "typescript";

const ROOT = import.meta.dirname;

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/**
 * Every extension of code ESLint reads. The layer rules match all of them,
 * so a .tsx, .mts or .js file can't step around a rule written for .ts.
 */
const CODE = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";
/** CODE without plain .ts. */
const NOT_PLAIN_TS = "{tsx,mts,cts,js,jsx,mjs,cjs}";

/**
 * Test code may reach across layers to set up state: the layer rules of
 * ARCHITECTURE §2.2 govern the code that ships. Engine tests still keep the
 * engine's purity rules.
 */
const TEST_FILES = [
  `**/*.{test,spec}.${CODE}`,
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
/**
 * The Supabase SDK lives behind GameBackend. A direct import would bypass
 * it and could land the SDK in a route's first load without the lazy
 * markers of our own wrapper modules (§10.9).
 */
const NO_SUPABASE = {
  group: ["@supabase/*"],
  message:
    "Only src/backend/supabase and src/lib/supabase use the Supabase SDK; go through @/backend (ARCHITECTURE §2.2, §7.1).",
};
/** Serwist is the service worker's library (§10.7). */
const NO_SERWIST = {
  group: ["serwist", "@serwist/*"],
  message:
    "Serwist runs inside the service worker: only src/pwa imports it (ARCHITECTURE §2.2, §10.7).",
};

// ---------------------------------------------------------------------------
// Engine purity (ARCHITECTURE §2.2, §4.1)
// ---------------------------------------------------------------------------

const ENGINE_IS_PURE =
  "src/engine is pure TypeScript (ARCHITECTURE §4.1): functions take data and return data.";

/**
 * Browser globals the engine may still use, because their output depends
 * only on their arguments.
 */
const ENGINE_PURE_GLOBALS = new Set([
  "Intl",
  "console",
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "structuredClone",
  "atob",
  "btoa",
  "AbortController",
]);

/** Globals the engine never touches that have a reason of their own. */
const ENGINE_GLOBAL_GROUPS = [
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
];

const ENGINE_GROUPED_GLOBALS = new Set(
  ENGINE_GLOBAL_GROUPS.flatMap(([, names]) => names),
);

/**
 * The DOM, storage, the network and every other browser API: the whole
 * browser table of the `globals` package (the list ESLint itself uses),
 * plus the global object, minus the pure names and the groups above.
 */
const ENGINE_BROWSER_GLOBALS = [
  ...new Set(["globalThis", ...Object.keys(globals.browser)]),
]
  .filter(
    (name) =>
      !ENGINE_PURE_GLOBALS.has(name) && !ENGINE_GROUPED_GLOBALS.has(name),
  )
  .sort();

const ENGINE_GLOBALS = [
  [
    `${ENGINE_IS_PURE} No DOM, storage or network: pass the data in.`,
    ENGINE_BROWSER_GLOBALS,
  ],
  ...ENGINE_GLOBAL_GROUPS,
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

/**
 * src/engine and src/content/schema hold .ts modules only: Node 22 strips
 * the types of a .ts file and runs it from scripts/, with no JSX and no
 * build step. The whole file is refused, whatever it contains.
 */
const PLAIN_TS_ONLY = (folder) => ({
  selector: "Program",
  message: `${folder} holds .ts modules only, which Node 22 runs from scripts/ without a build step (ARCHITECTURE §2.2, §4.1). Rename the file to .ts; JSX belongs in a feature.`,
});

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

const APP_EXCEPT = [
  anyIn("app"),
  anyIn("ui"),
  moduleAt("lib/env"),
  `${SRC_GLOB}/features/**/routes/**`,
];

const APP_ZONE = {
  target: "./src/app",
  from: ANYTHING_IN_SRC,
  except: APP_EXCEPT,
  message:
    "src/app holds routes only: it re-exports feature route modules (@/features/*/routes/*) and may use ui and @/lib/env (ARCHITECTURE §2.2).",
};

/**
 * Route handlers under src/app/api may also use @/platform/identity, which
 * holds the identity's formats: POST /api/identity checks the player id and
 * the secret before it sets the backup cookie, and GET /api/restore reads
 * the cookie back (ARCHITECTURE §9.3). The layers/paths-route-handlers
 * block puts this zone in APP_ZONE's place.
 */
const ROUTE_HANDLER_ZONE = {
  target: "./src/app/api",
  from: ANYTHING_IN_SRC,
  except: [...APP_EXCEPT, anyIn("platform/identity")],
  message:
    "Route handlers in src/app/api use @/platform/identity (the backup cookie's formats, ARCHITECTURE §9.3), feature route modules, ui and @/lib/env only (§2.2).",
};

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
  APP_ZONE,
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
  {
    // Shared code with no row of its own in §2.2, all of which reaches the
    // browser: @/lib/env, the analytics dictionary that track() is typed
    // against, config, and instrumentation-client.ts, which runs before
    // hydration.
    target: [
      "./src/lib",
      "./src/analytics",
      "./src/config",
      "./src/instrumentation.ts",
      "./src/instrumentation-client.ts",
    ],
    from: [
      anyIn("content/schema"),
      anyIn("content/pipeline"),
      `${ROOT_GLOB}/node_modules/zod/**`,
    ],
    message:
      "zod, src/content/schema and src/content/pipeline are build-time only: scripts and tests import them (ARCHITECTURE §2.2, §10.9).",
  },
];

// ---------------------------------------------------------------------------
// Local rules
// ---------------------------------------------------------------------------

const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;

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

/** A repository-relative path with forward slashes, for messages. */
const shown = (file) => relative(ROOT, file).split(sep).join("/");

/** `import type`, `export type`, or a list in which every name is a type. */
function isTypeOnlyDeclaration(node) {
  if (node.importKind === "type" || node.exportKind === "type") return true;
  const specifiers = node.specifiers ?? [];
  return (
    specifiers.length > 0 &&
    specifiers.every(
      (specifier) =>
        specifier.importKind === "type" || specifier.exportKind === "type",
    )
  );
}

/**
 * The modules a file passes values on from: `export * from`, `export { x }
 * from` with at least one value in the list, and `export { x }` or
 * `export default x` of a value it imported. Type-only exports are erased,
 * so they pass nothing on.
 */
function valueReexportsOf(file, text) {
  const jsx = file.endsWith("x");
  const kind = /\.[cm]?jsx?$/.test(file)
    ? jsx
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.JS
    : jsx
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    false,
    kind,
  );
  const imported = new Map();
  const exportedNames = [];
  const specifiers = new Set();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (
        clause === undefined ||
        clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
        clause.isTypeOnly === true ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }
      const from = statement.moduleSpecifier.text;
      if (clause.name !== undefined) imported.set(clause.name.text, from);
      const bindings = clause.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
        imported.set(bindings.name.text, from);
      } else if (bindings !== undefined) {
        for (const element of bindings.elements) {
          if (!element.isTypeOnly) imported.set(element.name.text, from);
        }
      }
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      const values =
        clause !== undefined && ts.isNamedExports(clause)
          ? clause.elements.filter((element) => !element.isTypeOnly)
          : null;
      if (statement.moduleSpecifier !== undefined) {
        if (
          ts.isStringLiteral(statement.moduleSpecifier) &&
          (values === null || values.length > 0)
        ) {
          specifiers.add(statement.moduleSpecifier.text);
        }
      } else if (values !== null) {
        for (const element of values) {
          exportedNames.push((element.propertyName ?? element.name).text);
        }
      }
    } else if (
      ts.isExportAssignment(statement) &&
      ts.isIdentifier(statement.expression)
    ) {
      exportedNames.push(statement.expression.text);
    }
  }
  for (const name of exportedNames) {
    const from = imported.get(name);
    if (from !== undefined) specifiers.add(from);
  }
  return [...specifiers];
}

/** What the barrel rule reads from a module, kept until the file changes. */
const moduleFacts = new Map();

function factsOf(file) {
  const { mtimeMs } = statSync(file);
  const cached = moduleFacts.get(file);
  if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached;
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const facts = {
    mtimeMs,
    client: USE_CLIENT.test(text),
    reexports: valueReexportsOf(file, text),
  };
  moduleFacts.set(file, facts);
  return facts;
}

/**
 * The chain of value re-exports that leads from `file` to a "use client"
 * module, ending with that module, or null when there is none. Each file
 * is read once per walk, so an import cycle ends it.
 */
function clientChainFrom(file, seen = new Set()) {
  if (seen.has(file)) return null;
  seen.add(file);
  const facts = factsOf(file);
  if (facts.client) return [file];
  for (const specifier of facts.reexports) {
    const target = resolveLocalModule(dirname(file), specifier);
    if (target === null) continue;
    const chain = clientChainFrom(target, seen);
    if (chain !== null) return [file, ...chain];
  }
  return null;
}

const qzPlugin = {
  meta: { name: "qz" },
  rules: {
    "no-client-in-barrel": {
      meta: {
        type: "problem",
        docs: {
          description:
            "A feature's index.ts never imports or re-exports a \"use client\" module, directly or through another module's re-exports (ARCHITECTURE §2.2).",
        },
        messages: {
          client:
            '"{{source}}" is a "use client" module. A route whose server code imports this index would carry it in its first load, used or not: export it from the feature\'s client.ts instead (ARCHITECTURE §2.2).',
          reexported:
            '"{{source}}" passes on a "use client" module ({{chain}}). A route whose server code imports this index would carry it in its first load, used or not: export it from the feature\'s client.ts instead (ARCHITECTURE §2.2).',
        },
        schema: [],
      },
      create(context) {
        const dir = dirname(context.physicalFilename);
        function check(node) {
          if (node.source === null || node.source === undefined) return;
          if (isTypeOnlyDeclaration(node)) return;
          const source = String(node.source.value);
          const file = resolveLocalModule(dir, source);
          const chain = file === null ? null : clientChainFrom(file);
          if (chain === null) return;
          context.report(
            chain.length === 1
              ? { node: node.source, messageId: "client", data: { source } }
              : {
                  node: node.source,
                  messageId: "reexported",
                  data: { source, chain: chain.map(shown).join(" > ") },
                },
          );
        }
        return {
          ImportDeclaration: check,
          ExportNamedDeclaration: check,
          ExportAllDeclaration: check,
        };
      },
    },
    "type-only-imports": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Imports from the given folders of the repository are type-only, whether the specifier is an @/ alias or a relative path (ARCHITECTURE §2.2).",
        },
        messages: { value: "{{message}}" },
        schema: [
          {
            type: "object",
            properties: {
              from: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
              },
              message: { type: "string" },
            },
            required: ["from", "message"],
            additionalProperties: false,
          },
        ],
      },
      create(context) {
        const [{ from, message }] = context.options;
        const folders = from.map((folder) => `${join(ROOT, folder)}${sep}`);
        const dir = dirname(context.physicalFilename);
        function check(node, typeOnly) {
          const source = node.source;
          if (
            typeOnly ||
            source === null ||
            source === undefined ||
            source.type !== "Literal" ||
            typeof source.value !== "string"
          ) {
            return;
          }
          const file = resolveLocalModule(dir, source.value);
          if (file === null) return;
          if (!folders.some((folder) => file.startsWith(folder))) return;
          context.report({
            node: source,
            messageId: "value",
            data: { message },
          });
        }
        return {
          ImportDeclaration: (node) => check(node, isTypeOnlyDeclaration(node)),
          ExportNamedDeclaration: (node) =>
            check(node, isTypeOnlyDeclaration(node)),
          ExportAllDeclaration: (node) =>
            check(node, node.exportKind === "type"),
          ImportExpression: (node) => check(node, false),
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
    files: [`src/**/*.${CODE}`],
    ignores: ["src/lib/env.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...ENV_ACCESS_SELECTORS],
    },
  },
  {
    name: "project/local-rules",
    plugins: { qz: qzPlugin },
  },

  // --- Layer rules (ARCHITECTURE §2.2) -------------------------------------
  // Each layer block sets @typescript-eslint/no-restricted-imports for its
  // own files, which never overlap, because a later block's options replace
  // an earlier one's. The resolved-path zones below catch what a specifier
  // can't show: relative paths across layers and dynamic imports. Every
  // block matches every code extension (CODE), so a .tsx, .mts or .js file
  // follows the same rules as a .ts one.
  {
    name: "layers/paths",
    files: [`src/**/*.${CODE}`],
    ignores: [...TEST_FILES, "src/app/api/**"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        { basePath: ROOT, zones: [...LAYER_ZONES, ...FEATURE_ZONES] },
      ],
    },
  },
  {
    // The same zones for route handlers, with ROUTE_HANDLER_ZONE in place of
    // APP_ZONE (no feature zone targets src/app).
    name: "layers/paths-route-handlers",
    files: [`src/app/api/**/*.${CODE}`],
    ignores: TEST_FILES,
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          basePath: ROOT,
          zones: LAYER_ZONES.map((zone) =>
            zone === APP_ZONE ? ROUTE_HANDLER_ZONE : zone,
          ),
        },
      ],
    },
  },
  {
    name: "layers/engine",
    files: [`src/engine/**/*.${CODE}`],
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
    files: [`src/engine/**/*.${CODE}`],
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
    // Last of the engine blocks: its list replaces theirs for these files.
    name: "layers/engine-ts-only",
    files: [`src/engine/**/*.${NOT_PLAIN_TS}`],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ENGINE_SYNTAX,
        NO_DYNAMIC_IMPORT,
        NODE_RUNNABLE_SYNTAX,
        PLAIN_TS_ONLY("src/engine"),
      ],
    },
  },
  {
    name: "layers/content-schema",
    files: [`src/content/schema/**/*.${CODE}`],
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
    name: "layers/content-schema-ts-only",
    files: [`src/content/schema/**/*.${NOT_PLAIN_TS}`],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ENV_ACCESS_SELECTORS,
        NODE_RUNNABLE_SYNTAX,
        PLAIN_TS_ONLY("src/content/schema"),
      ],
    },
  },
  {
    name: "layers/content",
    files: [
      `src/content/loaders/**/*.${CODE}`,
      `src/content/generated/**/*.${CODE}`,
      "src/content/types.ts",
    ],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [...NO_REACT_PATHS, NO_ZOD],
          patterns: [...NO_REACT_PATTERNS, NO_SUPABASE, NO_SERWIST],
        },
      ],
    },
  },
  {
    name: "layers/backend",
    files: [`src/backend/**/*.${CODE}`],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [...NO_REACT_PATHS, NO_ZOD],
          patterns: [...NO_REACT_PATTERNS, NO_SERWIST],
        },
      ],
      // By resolved path, so "../analytics/dictionary" counts too, and the
      // backend's own analytics adapters (./analytics) don't.
      "qz/type-only-imports": [
        "error",
        {
          from: ["src/analytics"],
          message:
            "src/backend takes types only from @/analytics/dictionary (ARCHITECTURE §2.2).",
        },
      ],
    },
  },
  {
    name: "layers/platform",
    files: [`src/platform/**/*.${CODE}`],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [...NO_REACT_PATHS, NO_ZOD],
          patterns: [...NO_REACT_PATTERNS, NO_SUPABASE, NO_SERWIST],
        },
      ],
      "qz/type-only-imports": [
        "error",
        {
          from: ["src/analytics", "src/backend"],
          message:
            "src/platform takes types only from analytics and @/backend: a backend implementation would make every adapter carry it (ARCHITECTURE §2.2, §2.3).",
        },
      ],
    },
  },
  {
    name: "layers/ui",
    files: [`src/ui/**/*.${CODE}`],
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
            NO_SUPABASE,
            NO_SERWIST,
          ],
        },
      ],
    },
  },
  {
    name: "layers/features-and-app",
    files: [`src/features/**/*.${CODE}`, `src/app/**/*.${CODE}`],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [NO_ZOD], patterns: [NO_SUPABASE, NO_SERWIST] },
      ],
    },
  },
  {
    name: "layers/pwa",
    files: [`src/pwa/**/*.${CODE}`],
    ignores: TEST_FILES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [...NO_REACT_PATHS, NO_ZOD],
          patterns: [...NO_REACT_PATTERNS, NO_SUPABASE],
        },
      ],
    },
  },
  {
    name: "layers/feature-barrels",
    files: ["src/features/*/index.{ts,tsx}"],
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
    // Service worker, generated after next build (ARCHITECTURE §10.7). ESLint
    // 9 doesn't read .gitignore, which lists them too.
    "public/sw.js",
    "public/sw.js.map",
  ]),
]);

export default eslintConfig;
