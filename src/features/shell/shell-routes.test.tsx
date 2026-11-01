import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { screen } from "@testing-library/react";
import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";

import { FEATURE_DEFAULTS } from "@/config/features";
import { renderWithUser } from "@/test/render";

import config from "../../../next.config";
import { SHELL_ROUTES, shellPath, shellRewrites } from "./shell-routes";

/** The patterns ARCHITECTURE §10.1 rewrites, verbatim. */
const SECTION_10_1 = [
  "/c/:code",
  "/c/:code/play",
  "/c/:code/result",
  "/j/:code",
  "/claim/:token",
  "/g/:groupId",
  "/g/:groupId/settings",
  "/room/:roomId",
  "/host/:roomId",
  "/join/:code",
  "/q/:code",
  "/q/:code/play",
  "/q/:code/result",
  "/create/:quizId",
];

function pageFile(group: string, shell: string): string {
  return resolve(process.cwd(), `src/app/(${group})/shell/${shell}/page.tsx`);
}

async function loadShell(
  group: string,
  shell: string,
): Promise<{ default: ComponentType; metadata: Metadata }> {
  return (await import(/* @vite-ignore */ pageFile(group, shell))) as {
    default: ComponentType;
    metadata: Metadata;
  };
}

describe("shell routes", () => {
  it("rewrite exactly the patterns of ARCHITECTURE §10.1, one shell each", () => {
    expect(SHELL_ROUTES.map((route) => route.source).sort()).toEqual(
      [...SECTION_10_1].sort(),
    );
    const shells = SHELL_ROUTES.map((route) => route.shell);
    expect(new Set(shells).size).toBe(shells.length);
  });

  it("are a plain array in next.config.ts, which Next applies after the filesystem", async () => {
    const rewrites = await config(PHASE_PRODUCTION_BUILD).rewrites?.();
    // An array (not { beforeFiles, afterFiles, fallback }) runs after pages
    // and public files, so /g/new, /join and /create/import still win.
    expect(Array.isArray(rewrites)).toBe(true);
    expect(rewrites).toEqual(shellRewrites());
    for (const route of SHELL_ROUTES) {
      expect(rewrites).toContainEqual({
        source: route.source,
        destination: shellPath(route.shell),
      });
    }
  });

  it.each(SHELL_ROUTES)(
    "$source is served by $group/shell/$shell, which only re-exports its route module",
    async ({ group, shell }) => {
      const file = pageFile(group, shell);
      expect(existsSync(file)).toBe(true);
      // Comments aside, the page is one re-export (however Prettier wraps it).
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\s+/g, " ")
        .trim();
      expect(code).toMatch(
        /^export \{ default, metadata,? \} from "@\/features\/[a-z/-]+\/routes\/[a-z-]+";$/,
      );
      const page = await loadShell(group, shell);
      expect(page.metadata.robots).toEqual({ index: false });
      expect(page.metadata.title).toMatch(/\S/);
    },
  );

  it.each(SHELL_ROUTES.filter((route) => route.flag === null))(
    "$shell renders its page with one heading",
    async ({ group, shell }) => {
      const { default: Page } = await loadShell(group, shell);
      renderWithUser(<Page />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    },
  );

  it.each(SHELL_ROUTES.filter((route) => route.flag !== null))(
    "$shell is the not-found page while its Beta flag ($flag) is off",
    async ({ group, shell, flag }) => {
      if (flag === null) throw new Error("unreachable");
      expect(FEATURE_DEFAULTS[flag]).toBe(false);
      const { default: Page } = await loadShell(group, shell);
      let thrown: unknown = null;
      try {
        renderWithUser(<Page />);
      } catch (error) {
        thrown = error;
      }
      expect((thrown as { digest?: string } | null)?.digest).toBe(
        "NEXT_HTTP_ERROR_FALLBACK;404",
      );
    },
  );
});
