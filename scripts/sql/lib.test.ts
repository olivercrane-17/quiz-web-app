// @vitest-environment node
/**
 * scripts/sql/lib.ts: migration names, the scan for SQL that cannot apply
 * unattended (the project's words and the Supabase MCP's own check), the
 * test and payload file shapes, and the repository's SQL held to all of it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MIGRATIONS_DIR,
  dollarQuoteHazards,
  dollarQuoted,
  dollarTag,
  listAreas,
  listMigrations,
  listTestFiles,
  mcpConfirmationReasons,
  mcpPieces,
  mcpWouldConfirm,
  parseAppliedMigrations,
  parseMigrationName,
  parsePayloadFile,
  parseTestFile,
  scanForbidden,
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

  it("stops for an UPDATE without WHERE inside a function body or a DO block, as the MCP does", () => {
    const body = `create or replace function private.set_state(p_state text) returns void
language plpgsql volatile set search_path = '' as $$
begin
  perform 1;
  update private.service_state set state = p_state, updated_at = private.now();
end $$;`;
    const block = `do $$ begin perform private.t_now('2026-11-04T12:00:00Z'); update private.config set value = '1'; end $$;`;
    expect(mcpWouldConfirm(body)).toBe(true);
    expect(mcpWouldConfirm(block)).toBe(true);
    expect(mcpConfirmationReasons(body)).toEqual([
      "UPDATE without WHERE (update private.service_state set state = p_state, updated_at = private.now())",
    ]);
    expect(mcpConfirmationReasons(block)).toEqual([
      "UPDATE without WHERE (update private.config set value = '1')",
    ]);
  });

  it("lets an UPDATE through once its WHERE comes before the next semicolon", () => {
    const sql = `create function f() returns void language plpgsql as $$
begin
  update private.ip_salts s
     set salt = extensions.gen_random_bytes(32)
   where s.day < current_date - 1;
end $$;
update t set note = $q$ a; b $q$ where id = 1;`;
    expect(mcpWouldConfirm(sql)).toBe(false);
    expect(mcpConfirmationReasons(sql)).toEqual([]);
  });

  it("flags a little more than the MCP, never less", () => {
    // A WHERE inside a quoted string is no WHERE once quotes are blanked.
    const quoted = "update t set note = 'where it was';";
    expect(mcpWouldConfirm(quoted)).toBe(true);
    expect(mcpConfirmationReasons(quoted)).toHaveLength(1);
    // The MCP reads past no comment and needs a table without an alias; we do neither.
    for (const sql of [
      "select 1;\n-- reset\nupdate t set a = 1;",
      "update private.config c set value = '1';",
    ]) {
      expect(mcpWouldConfirm(sql), sql).toBe(false);
      expect(mcpConfirmationReasons(sql), sql).toHaveLength(1);
    }
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

  it("splits as the MCP's In() does: on every semicolon outside a quote, dollar quotes included", () => {
    const sql =
      "select 'a;b'; do $$ begin null; end $$; -- c;\nselect \"x;y\" from t; /* d; */ select 2";
    expect(mcpPieces(sql).map((piece) => piece.text)).toEqual([
      "select ''",
      " do $$ begin null",
      " end $$",
      ' --\nselect "" from t',
      " /*",
      "*/ select 2",
    ]);
    // Inside an UPDATE a dollar-quoted string is taken whole.
    expect(
      mcpPieces("update t set v = $t$e;f$t$").map((piece) => piece.text),
    ).toEqual(["update t set v = $t$$t$"]);
    const pieces = mcpPieces("select 1;\nupdate x set y = 2");
    expect(pieces.map(({ start, end }) => [start, end])).toEqual([
      [0, 8],
      [9, 28],
    ]);
    // An unterminated quote: a plain split on semicolons, quotes blanked.
    expect(
      mcpPieces("select 'a; update t set b = 1").map((p) => p.text),
    ).toEqual(["select ''", " update t set b = 1"]);
  });
});

describe("dollar quotes", () => {
  it("picks a tag the body does not hold, so the quoting stays valid whatever the body quotes", () => {
    expect(dollarTag("begin null; end")).toBe("$qz_test$");
    expect(dollarTag("assert f('$$7') = '$$7';")).toBe("$qz_test$");
    expect(dollarTag("x := '$qz_test$';")).toBe("$qz_test_x$");
    expect(dollarTag("x := '$qz_test$ $qz_test_x$';")).toBe("$qz_test_xx$");
    expect(dollarTag("$body$", "body")).toBe("$body_x$");
    expect(() => dollarTag("", "7up")).toThrow(/letters and underscores/);
    // A body that holds both $$ and the first candidate: the tag stands only where the quote opens and closes.
    const body = "begin\n  assert f('a $$7 $qz_test$ b') = 'c$';\nend";
    const quoted = dollarQuoted(body);
    const tag = dollarTag(body);
    expect(quoted).toBe(`${tag}\n${body}\n${tag}`);
    expect(quoted.split(tag)).toEqual(["", `\n${body}\n`, ""]);
    expect(dollarQuoteHazards(`do ${quoted};`)).toEqual([]);
  });

  it("finds a body its own text ends early, and a quote that never closes", () => {
    const early = "begin;\ndo $$\nbegin\n  assert f('$$7') = 1;\nend\n$$;";
    expect(dollarQuoteHazards(early)).toEqual([
      { line: 4, message: expect.stringMatching(/opened with \$\$ on line 2/) },
      { line: 4, message: "a ' quote never closes" },
    ]);
    expect(
      dollarQuoteHazards(
        "create function f() returns text language sql as $f$\n  select 1; -- ends at $f$ here\n$f$;",
      ).map((hazard) => hazard.line),
    ).toEqual([2, 3]);
    expect(dollarQuoteHazards("do $a$ begin null; end;")).toEqual([
      { line: 1, message: "the dollar quote $a$ never closes" },
    ]);
  });

  it("passes sound quoting: other tags inside, apostrophes in dollar-quoted text, $1 and comments", () => {
    for (const sql of [
      "do $$ begin execute $q$select '$'$q$; perform 'it''s'; end $$;",
      "do $qz_test$ begin assert f('$$7') = '$$7'; end $qz_test$;",
      "update t set note = $q$ don't; $q$ where id = $1;",
      "select 1; -- a $$ in a comment\nselect '$$', \"$$\" /* $$ */;",
      "create function f(a text) returns text language sql as $$ select $1 || e'\\'' $$;",
    ]) {
      expect(dollarQuoteHazards(sql), sql).toEqual([]);
    }
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
      requires: [],
    });
  });

  it("reads the migrations a file requires from its header", () => {
    const test = parseTestFile(
      "t.test.sql",
      "-- about\n-- requires: 20261104000200_platform_jobs_attended\nbegin;\nselect 1;\n-- requires: 20991231000000_ignored\nselect 'PASS SQL-1 x';\nrollback;\n",
    );
    expect(test.requires).toEqual(["20261104000200_platform_jobs_attended"]);
    expect(() =>
      parseTestFile(
        "t.test.sql",
        "-- requires: platform_jobs\nbegin;\nselect 'PASS SQL-1 x';\nrollback;\n",
      ),
    ).toThrow(/requires/);
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
      if (!migration.attended) {
        expect(mcpConfirmationReasons(sql), migration.file).toEqual([]);
        expect(mcpWouldConfirm(sql), migration.file).toBe(false);
      }
    }
    for (const area of listAreas(ROOT)) {
      const dir = join(ROOT, "supabase/tests", area);
      const files = [
        ...listTestFiles(ROOT, area),
        ...readdirSync(dir)
          .filter((file) => file.endsWith(".payloads.sql"))
          .map((file) => `supabase/tests/${area}/${file}`),
      ];
      for (const path of files) {
        const sql = read(path);
        expect(scanForbidden(path, sql), path).toEqual([]);
        expect(mcpConfirmationReasons(sql), path).toEqual([]);
        expect(mcpWouldConfirm(sql), path).toBe(false);
        if (path.endsWith(".test.sql")) {
          expect(() => parseTestFile(path, sql), path).not.toThrow();
        }
      }
    }
  });

  it("holds no dollar quote that its own text would end early, in any SQL file under supabase/", () => {
    const files = (
      readdirSync(join(ROOT, "supabase"), { recursive: true }) as string[]
    )
      .filter((file) => file.endsWith(".sql"))
      .map((file) => `supabase/${file.replaceAll("\\", "/")}`);
    expect(files.length).toBeGreaterThan(40);
    for (const path of files) {
      expect(dollarQuoteHazards(read(path)), path).toEqual([]);
    }
  });

  it("marks attended only the migrations the MCP itself stops for", () => {
    for (const migration of migrations.filter((m) => m.attended)) {
      const sql = read(`${MIGRATIONS_DIR}/${migration.file}`);
      expect(mcpConfirmationReasons(sql), migration.file).not.toEqual([]);
      expect(mcpWouldConfirm(sql), migration.file).toBe(true);
    }
  });

  it("lists every attended migration in supabase/README.md with its purpose (decisions memo §21)", () => {
    const attended = migrations.filter((m) => m.attended);
    expect(attended.length).toBeGreaterThan(0);
    const readme = read("supabase/README.md");
    for (const migration of attended) {
      // A row of the attended files' table: | `<file>` | <purpose> |
      const row = readme
        .split("\n")
        .find((line) => line.startsWith(`| \`${migration.file}\``));
      expect(row, migration.file).toBeDefined();
      const purpose = row?.split("|")[2]?.trim() ?? "";
      expect(purpose.length, migration.file).toBeGreaterThan(20);
    }
  });
});
