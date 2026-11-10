// @vitest-environment node
/**
 * package.json's scripts name files that exist: `sql:gen` and
 * `codegen:analytics` were listed before their tickets (SQL-5, SQL-10)
 * wrote the scripts, so each failed with "Cannot find module". Those two
 * are gone until their tickets add them with their files.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FILE = /(?:^|\s)((?:scripts|src)\/[\w./-]+\.(?:ts|mjs|js))(?=\s|$)/g;

/**
 * Scripts listed ahead of the ticket that writes their file, which
 * ARCHITECTURE already names. An entry leaves this list with that ticket.
 */
const PENDING: Readonly<Record<string, string>> = {
  "content:schedule": "CNT-3",
  "content:weekly": "CNT-3",
};

describe("package.json scripts", () => {
  const { scripts } = JSON.parse(
    readFileSync(resolve(ROOT, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  const named = Object.entries(scripts).flatMap(([name, command]) =>
    [...command.matchAll(FILE)].map((match) => ({
      name,
      file: match[1] ?? "",
    })),
  );
  const missing = named
    .filter(({ file }) => !existsSync(resolve(ROOT, file)))
    .map(({ name }) => name);

  it("every script file a command names is in the repository, or waits for a named ticket", () => {
    // The rule finds the commands it is for.
    expect(named.length).toBeGreaterThan(20);
    expect(missing.filter((name) => !(name in PENDING))).toEqual([]);
  });

  it("a script whose ticket has landed is no longer listed as waiting", () => {
    expect(
      Object.keys(PENDING).filter((name) => !missing.includes(name)),
    ).toEqual([]);
  });
});
