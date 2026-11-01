/**
 * Per-user paths are served from static shells (ARCHITECTURE §10.1).
 *
 * Every pattern in src/features/shell/shell-routes.ts must answer with
 * exactly the bytes its shell answers at `/shell/<name>` (one prerendered
 * page per pattern, no render per code or token), with the address bar
 * left on the original path. Real pages under the same prefixes must keep
 * winning over the patterns, because `rewrites()` runs after the
 * filesystem.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SHELL_ROUTES,
  shellPath,
  type ShellRoute,
} from "../../src/features/shell/shell-routes";
import { expect, test } from "../fixtures";

/** A realistic address for each shell's pattern. */
const EXAMPLES: Record<string, string> = {
  challenge: "/c/AB12CD34",
  "challenge-play": "/c/AB12CD34/play",
  "challenge-result": "/c/AB12CD34/result",
  "group-invite": "/j/AB12CD34EF",
  claim: "/claim/kq3Zr0x9TWb7vY4mN2cH8sLp6eJd1gAfUoXiRtBnM5w",
  group: "/g/0f8fad5b-d9cb-469f-a165-70867728950e",
  "group-settings": "/g/0f8fad5b-d9cb-469f-a165-70867728950e/settings",
  room: "/room/7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "host-room": "/host/7c9e6679-7425-40de-944b-e07fc1f90ae7",
  join: "/join/482913",
  quiz: "/q/AB12CD34EF",
  "quiz-play": "/q/AB12CD34EF/play",
  "quiz-result": "/q/AB12CD34EF/result",
  editor: "/create/3f2504e0-4f89-41d3-9a0c-0305e82c3301",
};

/** A path no route or pattern serves. */
const NOWHERE = "/no-such-page-anywhere";

/**
 * Real pages that sit under rewritten prefixes, the shell that must never
 * answer them, and whether a Beta flag (off by default) turns the page into
 * the not-found page.
 */
const REAL_PAGES: {
  path: string;
  shell: string;
  owner: string;
  beta: boolean;
}[] = [
  { path: "/g/new", shell: "group", owner: "GRP-1", beta: false },
  { path: "/join", shell: "join", owner: "ROM-3", beta: true },
  { path: "/create/new", shell: "editor", owner: "EDT-1", beta: true },
  { path: "/create/import", shell: "editor", owner: "EDT-2", beta: true },
];

/** Whether this build has a page at `path` (read from the build's own route list). */
function builtPage(path: string): boolean {
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), ".next/app-path-routes-manifest.json"),
      "utf8",
    ),
  ) as Record<string, string>;
  return Object.values(manifest).includes(path);
}

function exampleFor(route: ShellRoute): string {
  const example = EXAMPLES[route.shell];
  if (example === undefined) throw new Error(`no example for ${route.shell}`);
  return example;
}

/** Chromium reports a document's 404 as a failed resource; a Beta page expects exactly that. */
function dropNotFoundReport(errors: string[]): void {
  const index = errors.findIndex((error) =>
    error.includes("status of 404 (Not Found)"),
  );
  if (index !== -1) errors.splice(index, 1);
}

test.describe("rewritten per-user paths", () => {
  test("every pattern has an example address", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual(
      SHELL_ROUTES.map((route) => route.shell).sort(),
    );
  });

  for (const route of SHELL_ROUTES) {
    const beta = route.flag !== null;

    test(`${route.source} serves the ${route.shell} shell with the address bar unchanged`, async ({
      page,
      request,
      consoleErrors,
    }) => {
      const example = exampleFor(route);
      const [rewritten, shell, nowhere] = await Promise.all([
        request.get(example),
        request.get(shellPath(route.shell)),
        request.get(NOWHERE),
      ]);
      // The very page the shell's own address serves: one prerender for every code.
      expect(rewritten.status()).toBe(shell.status());
      expect(await rewritten.text()).toBe(await shell.text());
      if (beta) {
        // Beta flags are off by default, so the shell is the not-found page
        // (AC-ROM-13), but its own one: not what an unknown path gets.
        expect(rewritten.status()).toBe(404);
        expect(await rewritten.text()).not.toBe(await nowhere.text());
      } else {
        expect(rewritten.status()).toBe(200);
      }

      const response = await page.goto(example);
      expect(response?.status()).toBe(beta ? 404 : 200);
      expect(new URL(page.url()).pathname).toBe(example);
      if (beta) {
        dropNotFoundReport(consoleErrors);
      } else {
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("main")).toBeVisible();
      }
      // Hydration has to settle without an error at the rewritten address.
      await page.waitForLoadState("networkidle");
    });
  }
});

test.describe("real pages under rewritten prefixes", () => {
  for (const { path, shell, owner, beta } of REAL_PAGES) {
    test(`${path} is never answered by the ${shell} shell`, async ({
      request,
    }) => {
      const shadowed = SHELL_ROUTES.some(
        (route) =>
          route.shell === shell &&
          new RegExp(`^${route.source.replace(/:[^/]+/g, "[^/]+")}$`).test(
            path,
          ),
      );
      // A pattern that matches the path wins only while the page is missing:
      // the check runs as soon as its owner builds the page.
      test.skip(
        shadowed && !builtPage(path),
        `${owner} builds ${path}; until then the ${shell} shell answers it`,
      );
      const [own, shellResponse] = await Promise.all([
        request.get(path),
        request.get(shellPath(shell)),
      ]);
      expect(await own.text()).not.toBe(await shellResponse.text());
      if (builtPage(path) && !beta) expect(own.status()).toBe(200);
    });
  }
});
