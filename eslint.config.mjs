import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

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
        tsconfigRootDir: import.meta.dirname,
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
    // Public env vars are inlined at build time and need shared fallbacks,
    // so they are only read in src/lib/env.ts. Next.js only inlines literal
    // process.env.NAME reads: a dynamic lookup or an alias of process.env is
    // silently undefined in the browser.
    name: "project/env-access",
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/env.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
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
      ],
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
