// @vitest-environment node
/**
 * scripts/sql/bundle-tests.ts: the one-transaction dry-run script, the
 * allowlist check against expected-advisors.json, and the refusals that
 * keep anything the MCP would stop for out of an unattended run.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  allowlistCheck,
  buildBundle,
  main,
  sendableProblems,
} from "./bundle-tests.ts";
import { mcpConfirmationReasons } from "./lib.ts";

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "qz-sql-bundle-"));
  temps.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const STANDING =
  "begin;\ndo $$ begin assert true; end $$;\nselect 'PASS SQL-1 standing: x';\nrollback;\n";
const EXPECTED = JSON.stringify({
  rpc: { lints: [], functions: [], why: "w" },
  accepted: [],
});

function quietly<T>(run: () => T): { result: T; errors: string } {
  const lines: string[] = [];
  const spy = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      lines.push(args.join(" "));
    });
  try {
    return { result: run(), errors: lines.join("\n") };
  } finally {
    spy.mockRestore();
  }
}

describe("buildBundle", () => {
  it("wraps everything in one transaction that rolls back, each test in its own savepoint", () => {
    const bundle = buildBundle({
      migrations: [
        {
          path: "supabase/migrations/20261104000000_baseline.sql",
          sql: "create schema if not exists private;",
        },
      ],
      tests: [
        {
          path: "a.test.sql",
          body: "do $$ begin assert true; end $$;",
          passLines: ["PASS AC-X-01 a", "PASS SQL-1 b"],
        },
      ],
      expectedRpcs: ["register_player"],
      payloads: [
        {
          path: "p.sql",
          sql: "insert into qz_test_results (line) select 'PAYLOAD x ' || 1;",
        },
      ],
      label: "unit",
    });
    const statements = bundle
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("--"));
    expect(statements[0]).toBe("begin;");
    expect(statements.at(-1)).toBe("rollback;");
    expect(bundle.indexOf("create schema if not exists private;")).toBeLessThan(
      bundle.indexOf("create temporary table"),
    );
    expect(bundle).toContain(
      "savepoint qz_test;\ndo $$ begin assert true; end $$;\nrollback to savepoint qz_test;\ninsert into qz_test_results (line) values ('PASS AC-X-01 a'), ('PASS SQL-1 b');",
    );
    expect(bundle).toContain(
      "v_expected text[] := array['register_player']::text[];",
    );
    expect(bundle.indexOf("PAYLOAD x")).toBeGreaterThan(
      bundle.indexOf("register_player"),
    );
    expect(statements.at(-2)).toContain(
      "'OK ' || count(*) filter (where line like 'PASS %') || ' checks'",
    );
    expect(mcpConfirmationReasons(bundle)).toEqual([]);
  });

  it("checks an empty allowlist against an empty list", () => {
    expect(allowlistCheck([]).body).toContain(
      "v_expected text[] := '{}'::text[];",
    );
    expect(allowlistCheck(["b", "a"]).body).toContain(
      "array['a', 'b']::text[]",
    );
  });
});

describe("sendableProblems", () => {
  it("refuses forbidden words, confirmation stops and transaction control", () => {
    expect(
      sendableProblems("m.sql", "begin;\nselect 1;\ncommit;", "migration"),
    ).toHaveLength(2);
    expect(
      sendableProblems("t.sql", "begin;\nselect 1;\ncommit;", "test"),
    ).toEqual([]);
    // The MCP splits on every semicolon, so the DELETE after "perform 1;" starts a piece.
    const body =
      "create function f() returns void language plpgsql as $$ begin\n  perform 1;\n  delete from t where id = 1;\nend $$;";
    expect(sendableProblems("m.sql", body, "migration").join(" ")).toContain(
      "the MCP would ask a human to confirm",
    );
    expect(sendableProblems("m.sql", body, "migration", true)).toEqual([]);
    expect(
      sendableProblems("m.sql", "drop table t;", "migration", true).join(" "),
    ).toContain("DROP");
  });
});

describe("main", () => {
  const files = {
    "supabase/migrations/20261031000000_key_escrow.sql":
      "create schema if not exists private;\n",
    "supabase/migrations/20261104000000_baseline.sql":
      "create table if not exists private.t (id int primary key);\n",
    "supabase/migrations/20261104000200_jobs_attended.sql":
      "create or replace function private.j() returns void language plpgsql as $$\nbegin\n  perform 1;\n  delete from private.t where id < 0;\nend $$;\n",
    "supabase/migrations/20261104000300_api_owner_only.sql":
      "select 'owner';\n",
    "supabase/tests/baseline/standing-checks.test.sql": STANDING,
    "supabase/tests/baseline/a.test.sql":
      "begin;\nselect 1;\nselect 'PASS SQL-1 a';\nrollback;\n",
    "supabase/expected-advisors.json": EXPECTED,
  };

  it("bundles the migrations after the last applied one, leaving attended and owner files out", () => {
    const root = tree(files);
    const out = join(root, "bundle.sql");
    const { result, errors } = quietly(() =>
      main(
        [
          "--area",
          "baseline",
          "--after",
          "20261031000000_key_escrow",
          "--out",
          out,
        ],
        root,
      ),
    );
    expect(result).toBe(0);
    const bundle = readFileSync(out, "utf8");
    expect(bundle).toContain("create table if not exists private.t");
    expect(bundle).not.toContain("private.j()");
    expect(bundle).not.toContain("'owner'");
    expect(bundle).toContain("'PASS SQL-1 a'");
    expect(bundle.indexOf("PASS SQL-1 a")).toBeLessThan(
      bundle.indexOf("PASS SQL-1 standing: x"),
    );
    expect(errors).toContain("left out 20261104000200_jobs_attended.sql");
  });

  it("includes an attended migration only with --attended, and names what the MCP will ask", () => {
    const root = tree(files);
    const out = join(root, "bundle.sql");
    const refused = quietly(() =>
      main(
        [
          "--with",
          "supabase/migrations/20261104000200_jobs_attended.sql",
          "--out",
          out,
        ],
        root,
      ),
    );
    expect(refused.result).toBe(1);
    expect(refused.errors).toContain("needs --attended");
    const attended = quietly(() =>
      main(
        ["--attended", "--after", "20261031000000_key_escrow", "--out", out],
        root,
      ),
    );
    expect(attended.result).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("private.j()");
    expect(attended.errors).toContain(
      "the MCP will ask to confirm: a statement starts with DELETE",
    );
  });

  it("never bundles an owner-only migration", () => {
    const root = tree(files);
    const { result, errors } = quietly(() =>
      main(
        ["--with", "supabase/migrations/20261104000300_api_owner_only.sql"],
        root,
      ),
    );
    expect(result).toBe(1);
    expect(errors).toContain("owner-only migrations are never bundled");
  });

  it("refuses a bundle that would stop for confirmation", () => {
    const root = tree({
      ...files,
      "supabase/tests/baseline/b.test.sql":
        "begin;\nupdate private.config set value = '0';\nselect 'PASS SQL-1 b';\nrollback;\n",
    });
    const { result, errors } = quietly(() =>
      main(["--area", "baseline"], root),
    );
    expect(result).toBe(1);
    expect(errors).toContain("UPDATE without WHERE");
  });

  it("bundles this repository's baseline tests unattended", () => {
    const out = join(tree({}), "bundle.sql");
    const { result } = quietly(() =>
      main(
        [
          "--area",
          "baseline",
          "--after",
          "20261031000000_key_escrow",
          "--out",
          out,
        ],
        process.cwd(),
      ),
    );
    expect(result).toBe(0);
    const bundle = readFileSync(out, "utf8");
    expect(mcpConfirmationReasons(bundle)).toEqual([]);
    expect(bundle).toContain(
      "-- ===== migration supabase/migrations/20261104000000_baseline.sql =====",
    );
    expect(bundle).toContain(
      "-- ===== migration supabase/migrations/20261104000100_helpers.sql =====",
    );
    expect(bundle).not.toContain(
      "-- ===== migration supabase/migrations/20261104000200_platform_jobs_attended.sql",
    );
    expect(bundle).not.toContain("_owner_only.sql =====");
  });
});
