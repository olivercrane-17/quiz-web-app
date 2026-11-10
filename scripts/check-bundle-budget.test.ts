// @vitest-environment node
/**
 * scripts/check-bundle-budget.mjs (SEC-1): ARCHITECTURE §10.9's per-route
 * budgets for first-load JavaScript, and the waivers that hold routes
 * already over budget to a ceiling.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BUDGETS,
  BudgetError,
  DEFAULT_BUDGET,
  HEADROOM_NOTE,
  WAIVERS,
  checkBudgets,
  readStats,
} from "./check-bundle-budget.mjs";

const SCRIPT = resolve(__dirname, "check-bundle-budget.mjs");

type Row = { route: string; firstLoadChunkPaths: string[] };

/** One chunk per route, named after it, so `sizes` can price each route. */
function statsFor(routes: readonly string[]): Row[] {
  return routes.map((route) => ({
    route,
    firstLoadChunkPaths: [`chunk:${route}`],
  }));
}

function pricedAt(sizes: Record<string, number>) {
  return (path: string) => sizes[path.slice("chunk:".length)] ?? 0;
}

const ROUTES = ["/", "/daily", "/practice/run", "/me"];
const WITHIN = {
  "/": 149_000,
  "/daily": 179_000,
  "/practice/run": 150_000,
  "/me": 199_000,
};

describe("the budgets", () => {
  it("are ARCHITECTURE §10.9's: 150 kB for /, 180 kB for the play routes, 200 kB for the rest", () => {
    expect(Object.fromEntries(BUDGETS)).toEqual({
      "/": 150_000,
      "/daily": 180_000,
      "/practice/run": 180_000,
    });
    expect(DEFAULT_BUDGET).toBe(200_000);
  });

  it("pass every route within its budget", () => {
    const { rows, problems, notes } = checkBudgets(
      statsFor(ROUTES),
      pricedAt(WITHIN),
      { waivers: new Map() },
    );

    expect(problems).toEqual([]);
    expect(notes).toEqual([]);
    expect(rows[0]).toMatch(/^\/ +149\.0 kB {3}99% of 150\.0 kB$/);
  });

  it.each([
    ["/", 150_001, "150.0 kB"],
    ["/daily", 180_500, "180.0 kB"],
    ["/practice/run", 181_000, "180.0 kB"],
    ["/me", 200_100, "200.0 kB"],
  ])("fail %s at %d bytes, over its %s budget", (route, size, budget) => {
    const { problems } = checkBudgets(
      statsFor(ROUTES),
      pricedAt({ ...WITHIN, [route]: size }),
      { waivers: new Map() },
    );

    expect(problems).toEqual([
      `${route} loads ${(size / 1000).toFixed(1)} kB of JavaScript first, over its ${budget} budget.`,
    ]);
  });

  it("fail when a budgeted route is missing from the build's stats", () => {
    const { problems } = checkBudgets(
      statsFor(["/", "/me"]),
      pricedAt(WITHIN),
      {
        waivers: new Map(),
      },
    );

    expect(problems).toEqual([
      "no stats for budgeted route(s): /daily, /practice/run.",
    ]);
  });
});

describe("the waivers", () => {
  const waivers = new Map([
    ["/daily", { ceiling: 230_000, measured: 223_000, until: "PERF-1" }],
  ]);

  it("let a route already over budget pass up to its ceiling, and say so", () => {
    const { rows, problems } = checkBudgets(
      statsFor(ROUTES),
      pricedAt({ ...WITHIN, "/daily": 224_000 }),
      { waivers },
    );

    expect(problems).toEqual([]);
    expect(rows[1]).toContain(
      "124% of 180.0 kB, waived up to 230.0 kB until PERF-1",
    );
  });

  it("note a waived route within HEADROOM_NOTE of its ceiling, without failing it", () => {
    expect(HEADROOM_NOTE).toBe(2_000);
    const near = checkBudgets(
      statsFor(ROUTES),
      pricedAt({ ...WITHIN, "/daily": 228_500 }),
      { waivers },
    );
    expect(near.problems).toEqual([]);
    expect(near.notes).toEqual([
      "/daily has 1.5 kB left under its waiver's 230.0 kB ceiling (PERF-1): measure any addition to it before merging.",
    ]);

    const roomy = checkBudgets(
      statsFor(ROUTES),
      pricedAt({ ...WITHIN, "/daily": 228_000 }),
      { waivers },
    );
    expect(roomy.notes).toEqual([]);
  });

  it("fail a waived route that grows past its ceiling", () => {
    const { problems } = checkBudgets(
      statsFor(ROUTES),
      pricedAt({ ...WITHIN, "/daily": 230_001 }),
      { waivers },
    );

    expect(problems).toEqual([
      "/daily loads 230.0 kB of JavaScript first, over its 180.0 kB budget and past its waiver's ceiling of 230.0 kB.",
    ]);
  });

  it("note a waiver that is no longer needed, or names a route the build lacks", () => {
    const { problems, notes } = checkBudgets(
      statsFor(ROUTES),
      pricedAt(WITHIN),
      {
        waivers: new Map([
          ...waivers,
          ["/gone", { ceiling: 1, measured: 1, until: "PERF-1" }],
        ]),
      },
    );

    expect(problems).toEqual([]);
    expect(notes).toEqual([
      "/daily fits its 180.0 kB budget now (179.0 kB): delete its waiver in scripts/check-bundle-budget.mjs.",
      "the waiver for /gone names a route this build doesn't have: delete it in scripts/check-bundle-budget.mjs.",
    ]);
  });

  it("are real: each route was over its budget when measured, and its ceiling leaves only a little room", () => {
    for (const [route, waiver] of WAIVERS) {
      const budget = BUDGETS.get(route) ?? DEFAULT_BUDGET;
      expect(waiver.measured, route).toBeGreaterThan(budget);
      expect(waiver.ceiling, route).toBeGreaterThan(waiver.measured);
      expect(waiver.ceiling - waiver.measured, route).toBeLessThanOrEqual(
        7_000,
      );
    }
  });
});

describe("the command", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** A fake build whose routes load one chunk of `bytes` random bytes. */
  function fakeBuild(bytes: number): string {
    const root = mkdtempSync(join(tmpdir(), "qz-bundle-budget-"));
    roots.push(root);
    const write = (path: string, content: string | Buffer) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    };
    // Random bytes, which gzip can't shrink.
    write(".next/static/chunks/main.js", randomBytes(bytes));
    write(
      ".next/diagnostics/route-bundle-stats.json",
      JSON.stringify(
        ["/", "/daily", "/practice/run"].map((route) => ({
          route,
          firstLoadChunkPaths: [".next/static/chunks/main.js"],
        })),
      ),
    );
    return root;
  }

  const run = (root: string) =>
    spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });

  it("exits 0 within budget and 1 over it", () => {
    const small = run(fakeBuild(1_000));
    expect(small.status, small.stderr).toBe(0);
    expect(small.stdout).toContain("/daily");

    const large = run(fakeBuild(160_000));
    expect(large.status).toBe(1);
    expect(large.stderr).toContain("check:bundle: / loads");
  });

  it("says to build first when there are no stats", () => {
    const root = mkdtempSync(join(tmpdir(), "qz-bundle-budget-"));
    roots.push(root);

    expect(() => readStats(root)).toThrow(BudgetError);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Run "npm run build" first.');
  });
});
