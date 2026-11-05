// @vitest-environment node
/**
 * The contract between SQL-3's content CLIs and content/README.md: every
 * option `content:release` and `content:dedupe` list in their --help is
 * written under the command's own heading in the README, and both keep the
 * behaviour every content command shares (src/content/pipeline/cli.ts):
 * --help prints the usage and exits 0, an unknown option exits 2 with it.
 * Neither run reads the content key: both stop while parsing.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../..");
const README = readFileSync(join(REPO, "content/README.md"), "utf8");
/** A HOME with no key file, so nothing here could ever find the key. */
const HOME = mkdtempSync(join(tmpdir(), "qz-readme-"));

afterAll(() => rmSync(HOME, { recursive: true, force: true }));

function cli(script: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      join(REPO, "scripts/content", `${script}.ts`),
      ...args,
    ],
    {
      cwd: REPO,
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** The README's `### <command>` section, up to the next heading of its level or above. */
function section(command: string): string {
  const heading = `\n### ${command}\n`;
  const start = README.indexOf(heading);
  if (start === -1) return "";
  const body = README.slice(start + heading.length);
  const end = body.search(/\n#{2,3} /);
  return end === -1 ? body : body.slice(0, end);
}

const COMMANDS = [
  ["content:release", "release"],
  ["content:dedupe", "dedupe"],
] as const;

describe("SQL-3's content CLIs and content/README.md", () => {
  for (const [command, script] of COMMANDS) {
    it(`documents every option ${command} --help lists, under its own heading`, () => {
      const help = cli(script, "--help");
      expect(help.status, help.stderr).toBe(0);
      expect(help.stdout).toMatch(/^Usage/);
      const options = [...new Set(help.stdout.match(/--[a-z][a-z-]*/g))];
      expect(options.length).toBeGreaterThanOrEqual(8);

      const words = section(command);
      expect(
        words,
        `content/README.md has a "### ${command}" section`,
      ).not.toBe("");
      const missing = options.filter(
        (option) => !new RegExp(`${option}(?![a-z-])`).test(words),
      );
      expect(missing).toEqual([]);
    });

    it(`${command} refuses an unknown option with exit code 2 and its usage`, () => {
      const result = cli(script, "--no-such-option");
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Unknown option '--no-such-option'");
      expect(result.stderr).toContain("Usage");
    });
  }

  it("names dedupe's --sealed, --cross-pool and --strict and the release flags in the README's examples", () => {
    const dedupe = section("content:dedupe");
    for (const flag of ["--sealed", "--cross-pool", "--strict"]) {
      expect(dedupe).toContain(`npm run content:dedupe -- ${flag}`);
    }
    const release = section("content:release");
    for (const flag of [
      "--version",
      "--allow-frozen",
      "--out",
      "--chunk-kb",
      "--today",
      "--json",
      "--fixtures",
      "--check",
    ]) {
      expect(release).toMatch(
        new RegExp(`npm run content:release -- .*${flag}`),
      );
    }
  });
});
