// @vitest-environment node
/**
 * scripts/sql/advisors-diff.ts: get_advisors output against
 * supabase/expected-advisors.json (ARCHITECTURE §8.2 rule 4).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  diffAdvisors,
  entryMatches,
  expandExpected,
  main,
  parseExpected,
  parseLints,
  type ExpectedEntry,
  type Lint,
} from "./advisors-diff.ts";

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const UNUSED: Lint = {
  name: "unused_index",
  level: "INFO",
  detail:
    "Index `rate_counters_window_start_idx` on table `private.rate_counters` has not been used",
  cache_key:
    "unused_index_private_rate_counters_rate_counters_window_start_idx",
  metadata: { name: "rate_counters", type: "table", schema: "private" },
};
const RPC: Lint = {
  name: "anon_security_definer_function_executable",
  level: "WARN",
  detail: "Function `public.register_player` can be executed by anon",
  metadata: { name: "register_player", type: "function", schema: "public" },
};
/** The hosted MCP's performance reply on 4 November 2026: findings grouped under their lint. */
const GROUPED = {
  result: {
    lints: [
      {
        name: "unused_index",
        title: "Unused Index",
        level: "INFO",
        facing: "EXTERNAL",
        categories: ["PERFORMANCE"],
        count: 2,
        findings: [
          {
            detail:
              "Index \\`rate_counters_window_start_idx\\` on table \\`private.rate_counters\\` has not been used",
            metadata: {
              name: "rate_counters",
              type: "table",
              schema: "private",
            },
          },
          {
            detail:
              "Index \\`write_keys_player_id_idx\\` on table \\`private.write_keys\\` has not been used",
            metadata: { name: "write_keys", type: "table", schema: "private" },
          },
        ],
      },
    ],
  },
};

describe("parseLints", () => {
  it("reads every form the reply is pasted in", () => {
    expect(parseLints({ result: { lints: [UNUSED] } })).toEqual([UNUSED]);
    expect(parseLints({ result: JSON.stringify({ lints: [UNUSED] }) })).toEqual(
      [UNUSED],
    );
    expect(parseLints({ lints: [] })).toEqual([]);
    expect(parseLints([RPC])).toEqual([RPC]);
    expect(() => parseLints({ result: {} })).toThrow(/lints array/);
    expect(() => parseLints([{ level: "WARN" }])).toThrow(/no name/);
  });

  it("splits a lint's grouped findings into one lint each", () => {
    const lints = parseLints(GROUPED);
    expect(
      lints.map((lint) => [lint.name, lint.level, lint.metadata?.name]),
    ).toEqual([
      ["unused_index", "INFO", "rate_counters"],
      ["unused_index", "INFO", "write_keys"],
    ]);
    expect(lints[1]?.detail).toContain("write_keys_player_id_idx");
    expect(
      parseLints({ lints: [{ name: "unused_index", count: 0, findings: [] }] }),
    ).toEqual([]);
    expect(() =>
      parseLints({ lints: [{ name: "unused_index", findings: {} }] }),
    ).toThrow(/not an array/);
    expect(() =>
      parseLints({ lints: [{ name: "unused_index", findings: ["x"] }] }),
    ).toThrow(/not an object/);
  });
});

describe("entryMatches", () => {
  const entry: ExpectedEntry = {
    lint: "unused_index",
    schema: "private",
    table: "rate_counters",
    index: "rate_counters_window_start_idx",
    required: false,
    why: "w",
  };

  it("matches the lint, schema, object and index", () => {
    expect(entryMatches(entry, UNUSED)).toBe(true);
    expect(
      entryMatches({ ...entry, index: "write_keys_created_at_idx" }, UNUSED),
    ).toBe(false);
    expect(entryMatches({ ...entry, table: "write_keys" }, UNUSED)).toBe(false);
    expect(entryMatches({ ...entry, schema: "public" }, UNUSED)).toBe(false);
    expect(entryMatches({ ...entry, lint: "duplicate_index" }, UNUSED)).toBe(
      false,
    );
  });

  it("falls back to the detail and cache key when metadata is missing", () => {
    const bare: Lint = {
      name: UNUSED.name,
      detail: UNUSED.detail,
      cache_key: UNUSED.cache_key,
    };
    expect(entryMatches(entry, bare)).toBe(true);
    expect(entryMatches({ ...entry, table: "alerts" }, bare)).toBe(false);
  });
});

describe("diffAdvisors", () => {
  it("passes expected findings and fails unexpected and missing ones", () => {
    const expected = expandExpected(
      parseExpected({
        rpc: {
          lints: ["anon_security_definer_function_executable"],
          functions: ["register_player", "get_profile"],
          why: "API",
        },
        accepted: [
          {
            lint: "unused_index",
            schema: "private",
            table: "rate_counters",
            index: "rate_counters_window_start_idx",
            required: false,
            why: "w",
          },
        ],
      }),
    );
    const stray: Lint = {
      name: "rls_disabled_in_public",
      level: "ERROR",
      metadata: { name: "leak", schema: "public" },
    };
    const diff = diffAdvisors(expected, [UNUSED, RPC, stray]);
    expect(diff.matched).toHaveLength(2);
    expect(diff.unexpected).toEqual([stray]);
    expect(diff.missingRequired.map((entry) => entry.function)).toEqual([
      "get_profile",
    ]);
    expect(diff.absentOptional).toEqual([]);
  });

  it("requires a why for every accepted entry", () => {
    expect(() =>
      parseExpected({
        rpc: { lints: [], functions: [], why: "" },
        accepted: [{ lint: "x", required: false, why: " " }],
      }),
    ).toThrow(/why/);
    expect(() => parseExpected({ accepted: [] })).toThrow(/rpc/);
  });
});

describe("main", () => {
  function write(name: string, value: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), "qz-sql-advisors-"));
    temps.push(dir);
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  }

  /** The definer lints the repository's RPCs bring, one per lint and function. */
  function rpcFindings(): Lint[] {
    const file = parseExpected(
      JSON.parse(readFileSync("supabase/expected-advisors.json", "utf8")),
    );
    return file.rpc.lints.flatMap((lint) =>
      file.rpc.functions.map((name) => ({
        ...RPC,
        name: lint,
        detail: `Function \`public.${name}\` can be executed`,
        metadata: { name, type: "function", schema: "public" },
      })),
    );
  }

  it("accepts the live project's advisors and the findings SQL-1 adds", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const security = write("security.json", {
      result: { lints: rpcFindings() },
    });
    const performance = write("performance.json", {
      result: { lints: [UNUSED] },
    });
    expect(main(["--security", security, "--performance", performance])).toBe(
      0,
    );
    expect(log.mock.calls.flat().join("\n")).toContain(
      "expected   unused_index private rate_counters",
    );
  });

  it("accepts the hosted MCP's grouped reply", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const performance = write("performance.json", GROUPED);
    expect(main(["--performance", performance])).toBe(0);
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain(
      "expected   unused_index private rate_counters rate_counters_window_start_idx",
    );
    expect(out).toContain(
      "expected   unused_index private write_keys write_keys_player_id_idx",
    );
  });

  it("fails on a finding nobody explained", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const unexplained: Lint = {
      ...RPC,
      detail: "Function `public.t_unexplained` can be executed by anon",
      metadata: { name: "t_unexplained", type: "function", schema: "public" },
    };
    const security = write("security.json", {
      result: { lints: [...rpcFindings(), unexplained] },
    });
    expect(main(["--security", security])).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("1 unexpected");
    expect(main([])).toBe(1);
  });

  it("keeps the expected file in the shape the scripts read", () => {
    const file = parseExpected(
      JSON.parse(readFileSync("supabase/expected-advisors.json", "utf8")),
    );
    expect(file.rpc.functions).toEqual([...new Set(file.rpc.functions)].sort());
    expect(
      file.rpc.functions.every((name) => /^[a-z][a-z0-9_]{0,62}$/.test(name)),
    ).toBe(true);
    expect(file.accepted.every((entry) => entry.why.length > 20)).toBe(true);
  });
});
