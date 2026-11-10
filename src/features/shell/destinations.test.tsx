import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { screen, within } from "@testing-library/react";
import type { Metadata } from "next";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { RESTORE_HREF, SYNC_HREF } from "@/features/identity/links";
import { buildSitemap } from "@/features/legal/routes/sitemap";
import { isNoindex } from "@/lib/metadata";
import { renderWithUser } from "@/test/render";

import { SHELL_COPY } from "./copy";
import { LEGAL_LINKS } from "./footer";
import { NOT_FOUND_METADATA } from "./not-found-metadata";
import { PagePlaceholder, placeholderLine } from "./page-placeholder";
import { SHELL_ROUTES, shellPath } from "./shell-routes";
import { TABS } from "./tabs";

vi.mock("next/navigation", () => ({ usePathname: () => "/no-such-page" }));

const APP = join(process.cwd(), "src/app");
const NOT_FOUND_HEADING = "We couldn't find that page.";

/** Every page under src/app, by the address it serves and the group it sits in. */
function pages(): Map<string, { file: string; group: string | null }> {
  const found = new Map<string, { file: string; group: string | null }>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (entry === "page.tsx") {
        const segments = relative(APP, dir).split(sep).filter(Boolean);
        const group =
          segments.find((segment) => /^\(.+\)$/.test(segment)) ?? null;
        const address = `/${segments.filter((segment) => !/^\(.+\)$/.test(segment)).join("/")}`;
        found.set(address, { file: path, group });
      }
    }
  };
  walk(APP);
  return found;
}

/** Every address the shell's chrome links to: the tabs, Settings, the footer, the wordmark. */
const SHELL_LINKS = [
  "/",
  ...TABS.map((tab) => tab.href),
  "/settings",
  ...LEGAL_LINKS.map((link) => link.href),
];

/**
 * Pages past their placeholder. The seven trust pages are LGL-1's, tested
 * in src/features/legal (the one h1, the unique title, the table of
 * contents and the text each must carry).
 */
const BUILT = new Set(LEGAL_LINKS.map((link) => link.href));

/** Where ARCHITECTURE §10.1 puts each destination. */
const GROUP_OF: Record<string, string> = {
  "/": "(tabs)",
  "/g": "(tabs)",
  "/me": "(tabs)",
  "/settings": "(tabs)",
  ...Object.fromEntries(LEGAL_LINKS.map((link) => [link.href, "(info)"])),
};

async function loadPage(
  file: string,
): Promise<{ default: ComponentType; metadata?: Metadata }> {
  return (await import(/* @vite-ignore */ file)) as {
    default: ComponentType;
    metadata?: Metadata;
  };
}

describe("every destination the shell draws", () => {
  const routes = pages();

  it("R1-02 has a page, in the route group ARCHITECTURE §10.1 gives it", () => {
    const missing = SHELL_LINKS.filter((href) => !routes.has(href));
    expect(missing).toEqual([]);
    for (const [href, group] of Object.entries(GROUP_OF)) {
      expect(routes.get(href)?.group, href).toBe(group);
    }
    // FIX-PRA's greybox hub, which the Practice tab opens (R1-02).
    expect(routes.get("/practice")?.group).toBe("(tabs)");
  });

  /** The destinations that are still placeholders: Groups, Me and Settings. */
  const PLACEHOLDERS = Object.keys(GROUP_OF).filter(
    (href) => href !== "/" && !BUILT.has(href),
  );

  it.each(PLACEHOLDERS.map((href) => [href]))(
    "R1-02 %s shows its title as the one h1, says what's coming and offers Go to Today",
    async (href) => {
      const page = routes.get(href);
      if (page === undefined) throw new Error(`no page for ${href}`);
      const { default: Page, metadata } = await loadPage(page.file);
      renderWithUser(<Page />);
      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0]).toHaveTextContent(String(metadata?.title));
      expect(
        screen.getByText(placeholderLine(String(metadata?.title))),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: SHELL_COPY.goToToday }),
      ).toHaveAttribute("href", "/");
      // A placeholder is no page for search engines yet.
      expect(metadata?.robots).toEqual({ index: false });
    },
  );

  it("R2-07 each placeholder destination renders its own line on what's coming and what works now", async () => {
    const lines = new Map<string, string>();
    for (const href of PLACEHOLDERS) {
      const page = routes.get(href);
      if (page === undefined) throw new Error(`no page for ${href}`);
      const { default: Page } = await loadPage(page.file);
      const { container, unmount } = renderWithUser(<Page />);
      const line = container.querySelector("[data-placeholder-line]");
      lines.set(href, line?.textContent ?? "");
      unmount();
    }
    // RITE round 2's lines, word for word (docs/playtests/rite-2.md §6).
    expect(Object.fromEntries(lines)).toEqual({
      "/g": "Groups are on the way. Until then, paste your result into your group chat.",
      "/me": "Your streak and past results will live here.",
      "/settings":
        "Settings are on the way. Hide stopwatch is in the Daily's menu.",
    });
    // Its own line, never another's, and never the general one.
    expect(new Set(lines.values()).size).toBe(lines.size);
    expect([...lines.values()]).not.toContain(SHELL_COPY.notReady);
  });

  /**
   * The per-user shells (ARCHITECTURE §10.1) whose route module is still a
   * stub, by address, with the title the stub passes: a link opens one of
   * them before its feature ships. Read from the source, because a Beta
   * stub is the not-found page while its flag is off.
   */
  const shellStubs = new Map<string, string>();
  for (const route of SHELL_ROUTES) {
    const href = shellPath(route.shell);
    const page = routes.get(href);
    if (page === undefined) throw new Error(`no page for ${href}`);
    const target = /from "@\/(.+?)"/.exec(readFileSync(page.file, "utf8"));
    if (target === null) continue;
    const source = readFileSync(
      join(process.cwd(), "src", `${target[1]}.tsx`),
      "utf8",
    );
    const title = /<PagePlaceholder\s+title="([^"]+)"/.exec(source);
    if (title !== null) shellStubs.set(href, title[1]);
  }

  it("R2-07 each placeholder shell a link opens has its own line too, never the general one", async () => {
    expect(shellStubs.size).toBeGreaterThan(0);
    for (const [href, title] of shellStubs) {
      expect(placeholderLine(title), href).not.toBe(SHELL_COPY.notReady);
      const page = routes.get(href);
      if (page === undefined) throw new Error(`no page for ${href}`);
      const { default: Page, metadata } = await loadPage(page.file);
      // A Beta stub with its flag off is the not-found page, with no line.
      if (metadata === NOT_FOUND_METADATA) continue;
      const { container, unmount } = renderWithUser(<Page />);
      expect(
        container.querySelector("[data-placeholder-line]")?.textContent,
        href,
      ).toBe(placeholderLine(title));
      unmount();
    }
  });

  it("R2-07 every line belongs to a page that is still a placeholder, one line each, so none is left over once its page is built", async () => {
    const titles = await Promise.all(
      PLACEHOLDERS.map(async (href) => {
        const page = routes.get(href);
        if (page === undefined) throw new Error(`no page for ${href}`);
        return String((await loadPage(page.file)).metadata?.title);
      }),
    );
    expect(Object.keys(SHELL_COPY.comingSoon).sort()).toEqual(
      [...new Set([...titles, ...shellStubs.values()])].sort(),
    );
    const all = Object.values(SHELL_COPY.comingSoon);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(LEGAL_LINKS.map((link) => [link.href]))(
    "R2-07 the footer's %s is LGL-1's real page, not a placeholder that needs a line",
    async (href) => {
      const page = routes.get(href);
      if (page === undefined) throw new Error(`no page for ${href}`);
      const { default: Page } = await loadPage(page.file);
      const { container } = renderWithUser(<Page />);
      expect(container.querySelector("[data-placeholder-line]")).toBeNull();
      expect(screen.queryByText(SHELL_COPY.notReady)).toBeNull();
    },
  );

  it("R2-07 a placeholder shows the line it is given, and an unknown one says it isn't ready yet", () => {
    const { rerender } = renderWithUser(
      <PagePlaceholder title="Group board" line="Boards come with Groups." />,
    );
    expect(screen.getByText("Boards come with Groups.")).toBeVisible();
    expect(screen.queryByText(SHELL_COPY.notReady)).toBeNull();
    rerender(<PagePlaceholder title="Somewhere new" />);
    expect(screen.getByText(SHELL_COPY.notReady)).toBeVisible();
    // A destination's own line comes by its title, which its stub passes.
    rerender(<PagePlaceholder title={SHELL_COPY.tabs.groups} />);
    expect(
      screen.getByText(SHELL_COPY.comingSoon[SHELL_COPY.tabs.groups]),
    ).toBeVisible();
  });

  it("R1-09 gives each destination a title of its own, for the route announcer", async () => {
    const titles = await Promise.all(
      Object.keys(GROUP_OF)
        .filter((href) => href !== "/")
        .map(async (href) => {
          const page = routes.get(href);
          if (page === undefined) throw new Error(`no page for ${href}`);
          return String((await loadPage(page.file)).metadata?.title);
        }),
    );
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).not.toContain("undefined");
  });
});

/**
 * IDN-2's two pages sit beside the shell's destinations without being
 * drawn by the shell: Me (STA-1), Settings (SET-1), each other and the
 * claim page link to them. They must still agree with LGL-1's footer and
 * sitemap and with the destinations above.
 */
describe("IDN-2's sync code and restore pages beside the shell's destinations", () => {
  const routes = pages();
  const IDENTITY_PAGES = [
    [SYNC_HREF, "(tabs)"],
    [RESTORE_HREF, "(landing)"],
  ] as const;

  async function metadataOf(href: string): Promise<Metadata | undefined> {
    const page = routes.get(href);
    if (page === undefined) throw new Error(`no page for ${href}`);
    return (await loadPage(page.file)).metadata;
  }

  it("R1-02 puts /me/sync in (tabs), under Me, and /restore in (landing), as ARCHITECTURE §10.1 does", () => {
    for (const [href, group] of IDENTITY_PAGES) {
      expect(routes.get(href)?.group, href).toBe(group);
    }
  });

  it("R1-09 gives each a title of its own, which no shell destination or trust page shares", async () => {
    const theirs = await Promise.all(
      IDENTITY_PAGES.map(async ([href]) =>
        String((await metadataOf(href))?.title),
      ),
    );
    const shell = await Promise.all(
      Object.keys(GROUP_OF)
        .filter((href) => href !== "/")
        .map(async (href) => String((await metadataOf(href))?.title)),
    );
    expect(theirs).not.toContain("undefined");
    expect(new Set(theirs).size).toBe(theirs.length);
    for (const title of theirs) expect(shell).not.toContain(title);
  });

  it("keeps both out of search and out of the footer: noindex, and absent from the sitemap with every flag on", async () => {
    const listed = buildSitemap("https://knewt.example", () => true).map(
      (entry) => new URL(entry.url).pathname,
    );
    expect(listed).toContain("/credits");
    for (const [href] of IDENTITY_PAGES) {
      expect(isNoindex(await metadataOf(href)), href).toBe(true);
      expect(listed).not.toContain(href);
      expect(LEGAL_LINKS.map((link) => link.href)).not.toContain(href);
    }
  });
});

describe("the not-found page", () => {
  it("R1-02 says DESIGN §12.42's words inside the tab frame, with Go to Today and Practice", async () => {
    const { default: NotFound, metadata } = await loadPage(
      join(APP, "not-found.tsx"),
    );
    renderWithUser(<NotFound />);

    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", {
        level: 1,
        name: "We couldn't find that page.",
      }),
    ).toBeVisible();
    expect(
      within(main).getByText("Even the newt can't find it."),
    ).toBeVisible();
    expect(
      within(main).getByRole("link", { name: "Go to Today" }),
    ).toHaveAttribute("href", "/");
    expect(
      within(main).getByRole("link", { name: "Practice" }),
    ).toHaveAttribute("href", "/practice");
    // The tab bar is there, so a dead link never strands anyone...
    const bars = screen.getAllByRole("navigation", {
      name: SHELL_COPY.mainNav,
    });
    expect(bars).not.toHaveLength(0);
    // ...with no tab marked: the page is prerendered once for every address.
    for (const bar of bars) {
      for (const link of within(bar).getAllByRole("link")) {
        expect(link).not.toHaveAttribute("aria-current");
      }
    }
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeVisible();
    expect(metadata?.title).toBe("Page not found");
  });

  it("R1-02 hands every notFound() the same title, and no second robots tag", () => {
    // Next adds noindex to every not-found response, so the metadata that
    // a route module exports for its notFound() case carries the title only.
    expect(NOT_FOUND_METADATA).toEqual({ title: "Page not found" });
  });

  it.each(["(tabs)", "(info)", "(landing)", "(host)"])(
    "R1-02 inside the %s group, where the layout drew the frame, says only its words",
    async (group) => {
      const { default: NotFound } = await loadPage(
        join(APP, group, "not-found.tsx"),
      );
      const { container } = renderWithUser(<NotFound />);
      expect(
        screen.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
      ).toBeVisible();
      expect(screen.getByRole("link", { name: "Go to Today" })).toBeVisible();
      // No second header, main or tab bar inside the group's own.
      expect(container.querySelector("header, main, nav")).toBeNull();
    },
  );

  it("R1-02 inside the (play) group, whose screens draw their own frame, brings the tab frame without a second skip link", async () => {
    const { default: NotFound } = await loadPage(
      join(APP, "(play)", "not-found.tsx"),
    );
    renderWithUser(<NotFound />);
    expect(
      within(screen.getByRole("main")).getByRole("heading", {
        level: 1,
        name: NOT_FOUND_HEADING,
      }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("navigation", { name: SHELL_COPY.mainNav }),
    ).not.toHaveLength(0);
    // The (play) layout has the skip link and the live regions already.
    expect(screen.queryByRole("link", { name: "Skip to content" })).toBeNull();
  });
});
