// @vitest-environment node
/**
 * package.json's `sideEffects` field (Integration 8): the bundler may drop
 * any module of ours whose exports go unused, unless the field lists it. So
 * every module under src/ that does something as it loads, beyond declaring
 * things, has to be listed: a top-level call, a top-level branch or loop,
 * or an import for its effect alone. Today that is the stylesheets,
 * `src/backend/index.ts` (it selects the content world) and
 * `src/ui/focus-ring.ts` (it starts watching input); the instrumentation
 * files (ANA-1) and the service worker's folder (PWA-1) are listed ahead
 * of their tickets, since both run for their effects.
 *
 * Without the field /practice/run ships the whole Mystery and Encore UI
 * through the rounds' barrel, about 27 kB gzipped.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const { sideEffects } = JSON.parse(
  readFileSync(resolve(ROOT, "package.json"), "utf8"),
) as { sideEffects?: string[] };
const listed = sideEffects ?? [];

/** Test-only modules: no bundle holds them. */
const TEST_ONLY = /(\.(test|spec|bench)\.|\/test\/|\/testing\.tsx?$|\.d\.ts$)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|mjs|js)$/.test(name) && !TEST_ONLY.test(path)
      ? [path]
      : [];
  });
}

/** Whether `file` ("./src/...") matches an entry, by the bundlers' glob rules for the forms used here. */
function isListed(file: string): boolean {
  return listed.some((entry) => {
    if (!entry.includes("/")) {
      return entry.startsWith("*") && file.endsWith(entry.slice(1));
    }
    const pattern = entry
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\u0000")
      .replace(/\*/g, "[^/]*")
      .replace(/\u0000/g, ".*");
    return new RegExp(`^${pattern}$`).test(file);
  });
}

/** What the module does as it loads, one line per statement. */
function loadEffects(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  for (const statement of source.statements) {
    const text = statement.getText(source).split("\n")[0] ?? "";
    if (ts.isExpressionStatement(statement)) {
      const { expression } = statement;
      // A directive ("use client"), or `void NAME;`, which only reads a constant.
      if (ts.isStringLiteral(expression)) continue;
      if (
        ts.isVoidExpression(expression) &&
        ts.isIdentifier(expression.expression)
      ) {
        continue;
      }
      found.push(text);
    } else if (
      ts.isIfStatement(statement) ||
      ts.isIterationStatement(statement, false) ||
      ts.isTryStatement(statement) ||
      ts.isSwitchStatement(statement) ||
      ts.isBlock(statement)
    ) {
      found.push(text);
    } else if (
      ts.isImportDeclaration(statement) &&
      statement.importClause === undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      !isListed(statement.moduleSpecifier.text)
    ) {
      // An import for its effect alone: fine when what it names is listed.
      found.push(text);
    }
  }
  return found;
}

describe("package.json sideEffects", () => {
  it("lists every module under src/ that does something as it loads", () => {
    const unlisted = sources(resolve(ROOT, "src")).flatMap((path) => {
      const file = `./${relative(ROOT, path).split("\\").join("/")}`;
      const effects = loadEffects(path);
      return effects.length > 0 && !isListed(file)
        ? [`${file}: ${effects.join(" | ")}`]
        : [];
    });
    expect(unlisted).toEqual([]);
  });

  it("names the stylesheets, the two modules that act on load, and the files two tickets will add", () => {
    expect(listed).toEqual([
      "*.css",
      "./src/backend/index.ts",
      "./src/ui/focus-ring.ts",
      "./src/instrumentation*.ts",
      "./src/pwa/**",
    ]);
    for (const file of ["./src/backend/index.ts", "./src/ui/focus-ring.ts"]) {
      expect(loadEffects(resolve(ROOT, file)), file).not.toEqual([]);
    }
    expect(isListed("./src/app/globals.css")).toBe(true);
    expect(isListed("./src/instrumentation-client.ts")).toBe(true);
    expect(isListed("./src/pwa/sw.ts")).toBe(true);
    expect(isListed("./src/ui/button.tsx")).toBe(false);
  });
});
