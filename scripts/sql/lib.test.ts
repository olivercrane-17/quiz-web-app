// @vitest-environment node
/**
 * scripts/sql/lib.ts: migration names, the scan for SQL that cannot apply
 * unattended (the project's words and the Supabase MCP's own check), the
 * test and payload file shapes, and the repository's SQL held to all of it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MIGRATIONS_DIR,
  listAreas,
  listMigrations,
  listTestFiles,
  mcpConfirmationReasons,
  parseAppliedMigrations,
  parseMigrationName,
  parsePayloadFile,
  parseTestFile,
  scanForbidden,
  splitStatements,
  transactionControlLines,
} from "./lib.ts";

const ROOT = process.cwd();

function rules(sql: string): string[] {
  return scanForbidden("t.sql", sql).map((finding) => finding.rule);
}

describe("parseMigrationName", () => {
  it("reads the version, the stem and the kind", () => {
    expect(parseMigrationName("20261104000000_baseline.sql")).toEqual({
      file: "20261104000000_baseline.sql",
      stem: "20261104000000_baseline",
      version: "20261104000000",
      ownerOnly: false,
      attended: false,
    });
    expect(
      parseMigrationName("20261104000300_api_surface_owner_only.sql")
        ?.ownerOnly,
    ).toBe(true);
    expect(
      parseMigrationName("20261104000200_platform_jobs_attended.sql")?.attended,
    ).toBe(true);
    for (const bad of [
      "baseline.sql",
      "2026110400000_short.sql",
      "20261104000000_Baseline.sql",
      "20261104000000_a-b.sql",
    ]) {
      expect(parseMigrationName(bad), bad).toBeNull();
    }
  });
});

describe("scanForbidden", () => {
  it("finds the words the MCP stops for, comments included", () => {
    expect(rules("drop table x;")).toEqual(["DROP"]);
    expect(rules("-- we never drop anything\nselect 1;")).toEqual(["DROP"]);
    expect(rules("revoke all on schema private from anon;")).toEqual([
      "REVOKE",
    ]);
    expect(rules("truncate private.config;")).toEqual(["TRUNCATE"]);
    expect(rules("alter table x rename to y;")).toEqual(["RENAME"]);
    expect(rules("alter role authenticator set x = 1;")).toEqual([
      "ALTER ROLE",
    ]);
    expect(rules("alter\n  user postgres set x = 1;")).toEqual(["ALTER ROLE"]);
  });

  it("allows a DELETE with a WHERE and names that only contain a word", () => {
    expect(
      rules("delete from private.write_keys k where k.created_at < now();"),
    ).toEqual([]);
    expect(rules("delete from private.write_keys;")).toEqual([
      "DELETE without WHERE",
    ]);
    expect(
      rules("select drop_rate, dropdown, renamed from t; -- truncated"),
    ).toEqual([]);
  });

  it("finds characters a reviewer cannot see", () => {
    expect(rules(`select 'a${String.fromCharCode(0x202e)}b';`)).toEqual([
      "invisible character U+202E",
    ]);
    expect(rules(`select 'zero${String.fromCharCode(0x200b)}width';`)).toEqual([
      "invisible character U+200B",
    ]);
    expect(rules("select '\\u200B';\tselect 1;\r\n")).toEqual([]);
  });

  it("reports the line of each finding", () => {
    expect(scanForbidden("m.sql", "select 1;\n\ndrop view v;")).toEqual([
      { file: "m.sql", line: 3, rule: "DROP", excerpt: "drop view v;" },
    ]);
  });
});

describe("mcpConfirmationReasons", () => {
  it("stops for a DELETE inside a function body, WHERE or not, as the MCP does", () => {
    const sql = `create or replace function private.prune() returns void language plpgsql as $$
begin
  perform 1;
  delete from private.ip_salts s where s.day < current_date - 1;
end $$;`;
    expect(mcpConfirmationReasons(sql)).toEqual([
      "a statement starts with DELETE (delete from private.ip_salts s where s.day < current_date - 1)",
    ]);
  });

  it("stops for destructive EXECUTE strings, DROP COLUMN and UPDATE without WHERE", () => {
    expect(
      mcpConfirmationReasons("do $$ begin execute 'truncate t'; end $$;"),
    ).toHaveLength(1);
    expect(
      mcpConfirmationReasons(
        "do $$ begin execute format('delete from %I', 't'); end $$;",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      mcpConfirmationReasons("alter table t drop column c;").length,
    ).toBeGreaterThan(0);
    expect(
      mcpConfirmationReasons("alter table if exists private.t drop c cascade;"),
    ).toEqual([
      "ALTER TABLE ... DROP of a column (alter table if exists private.t drop c cascade)",
    ]);
    expect(
      mcpConfirmationReasons("alter table t drop constraint t_pkey;"),
    ).toEqual([]);
    expect(
      mcpConfirmationReasons("update private.config set value = '0';"),
    ).toEqual(["UPDATE without WHERE (update private.config set value = '0')"]);
  });

  it("lets through what SQL-1 sends unattended", () => {
    expect(
      mcpConfirmationReasons(`-- a comment that says delete from x;
create table if not exists private.t (id int primary key);
do $$ begin execute format('alter table %s enable row level security', 'private.t'); end $$;
update private.config set value = '1' where key = 'egress_sample_rate';
insert into private.config as c (key, value) values ('k', '1') on conflict (key) do update set value = c.value;
do $$ begin update private.config set value = '0' where key = 'k'; end $$;
savepoint qz_test;
rollback to savepoint qz_test;`),
    ).toEqual([]);
  });

  it("splits statements around quotes and dollar quotes", () => {
    expect(
      splitStatements(
        "select 'a;b'; do $$ begin null; end $$; -- c;\nselect \"x;y\" from t;",
      ),
    ).toEqual([
      "select 'a;b'",
      "do $$ begin null; end $$",
      'select "x;y" from t',
    ]);
  });
});

describe("transactionControlLines", () => {
  it("finds top-level transaction control but not plpgsql block ends", () => {
    const sql =
      "begin;\ncreate function f() returns void language plpgsql as $$\nbegin\n  null;\nend;\n$$;\ncommit;\nsavepoint s;";
    expect(transactionControlLines(sql)).toEqual([1, 7, 8]);
  });
});

describe("parseTestFile", () => {
  it("takes the body between begin and rollback and every PASS line", () => {
    const test = parseTestFile(
      "t.test.sql",
      "-- about\nbegin;\ndo $$ begin assert true; end $$;\nselect 'PASS AC-X-01 one';\nselect 'PASS SQL-1 two';\n\nrollback;\n",
    );
    expect(test).toEqual({
      path: "t.test.sql",
      body: "do $$ begin assert true; end $$;",
      passLines: ["PASS AC-X-01 one", "PASS SQL-1 two"],
    });
  });

  it("refuses files that break the shape", () => {
    expect(() => parseTestFile("a", "select 'PASS x';\nrollback;")).toThrow(
      /first statement/,
    );
    expect(() =>
      parseTestFile("b", "begin;\nselect 'PASS x';\ncommit;"),
    ).toThrow(/last statement/);
    expect(() => parseTestFile("c", "begin;\nselect 1;\nrollback;")).toThrow(
      /PASS/,
    );
    expect(() =>
      parseTestFile("d", "begin;\ncommit;\nselect 'PASS x';\nrollback;"),
    ).toThrow(/transaction control/);
  });
});

describe("parsePayloadFile", () => {
  it("turns each payload into a PAYLOAD result row", () => {
    expect(
      parsePayloadFile(
        "p.sql",
        "select private.t_now('2026-11-04T12:00:00Z');\n-- payload: envelope.ok\nselect private.ok(\n  '{}');\n",
      ),
    ).toBe(
      "select private.t_now('2026-11-04T12:00:00Z');\ninsert into qz_test_results (line) select 'PAYLOAD envelope.ok ' || (private.ok(\n  '{}'))::text;",
    );
    expect(() => parsePayloadFile("p.sql", "select 1;")).toThrow(
      /no "-- payload/,
    );
    expect(() =>
      parsePayloadFile("p.sql", "-- payload: x\ninsert into t values (1);"),
    ).toThrow(/one "select/);
  });
});

describe("parseAppliedMigrations", () => {
  it("reads list_migrations output in each pasted form", () => {
    const names = ["20261031000000_key_escrow"];
    expect(
      parseAppliedMigrations({
        migrations: [{ version: "20261031222446", name: names[0] }],
      }),
    ).toEqual(names);
    expect(parseAppliedMigrations([{ name: names[0] }])).toEqual(names);
    expect(parseAppliedMigrations(names)).toEqual(names);
    expect(() =>
      parseAppliedMigrations({ migrations: [{ version: "1" }] }),
    ).toThrow(/no name/);
    expect(() => parseAppliedMigrations("nope")).toThrow();
  });
});

describe("the repository's SQL", () => {
  const { migrations, badNames } = listMigrations(ROOT);
  const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

  it("names every migration by the rule", () => {
    expect(badNames).toEqual([]);
    expect(migrations.map((migration) => migration.stem)).toContain(
      "20261104000000_baseline",
    );
  });

  /** Applied before this check existed, and never edited or sent again; its comments name the words. */
  const GRANDFATHERED = new Set(["20261031000000_key_escrow.sql"]);

  it("sends no forbidden word and no confirmation stop from anything agents apply unattended", () => {
    for (const migration of migrations.filter((m) => !m.ownerOnly)) {
      const sql = read(`${MIGRATIONS_DIR}/${migration.file}`);
      if (!GRANDFATHERED.has(migration.file)) {
        expect(scanForbidden(migration.file, sql), migration.file).toEqual([]);
      }
      expect(transactionControlLines(sql), migration.file).toEqual([]);
      if (!migration.attended)
        expect(mcpConfirmationReasons(sql), migration.file).toEqual([]);
    }
    for (const area of listAreas(ROOT)) {
      for (const path of listTestFiles(ROOT, area)) {
        const sql = read(path);
        expect(scanForbidden(path, sql), path).toEqual([]);
        expect(mcpConfirmationReasons(sql), path).toEqual([]);
        expect(() => parseTestFile(path, sql), path).not.toThrow();
      }
    }
  });

  it("marks attended only the migrations that need a confirmation", () => {
    for (const migration of migrations.filter((m) => m.attended)) {
      expect(
        mcpConfirmationReasons(read(`${MIGRATIONS_DIR}/${migration.file}`)),
        migration.file,
      ).not.toEqual([]);
    }
  });
});
