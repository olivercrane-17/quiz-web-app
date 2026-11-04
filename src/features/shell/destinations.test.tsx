import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { screen, within } from "@testing-library/react";
import type { Metadata } from "next";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import { SHELL_COPY } from "./copy";
import { LEGAL_LINKS } from "./footer";
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

/**
 * Destinations other lanes build on their own branches: FIX-PRA's greybox
 * /practice (RITE round 1, R1-02). Once it merges, the check below covers it
 * like the rest; until then the not-found page catches the tab.
 */
const BUILT_ELSEWHERE = new Set(["/practice"]);

/** Every address the shell's chrome links to: the tabs, Settings, the footer, the wordmark. */
const SHELL_LINKS = [
  "/",
  ...TABS.map((tab) => tab.href),
  "/settings",
  ...LEGAL_LINKS.map((link) => link.href),
];

/** Where ARCHITECTURE §10.1 puts each placeholder. */
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
    const missing = SHELL_LINKS.filter(
      (href) => !routes.has(href) && !BUILT_ELSEWHERE.has(href),
    );
    expect(missing).toEqual([]);
    for (const [href, group] of Object.entries(GROUP_OF)) {
      expect(routes.get(href)?.group, href).toBe(group);
    }
  });

  it.each(
    Object.keys(GROUP_OF)
      .filter((href) => href !== "/")
      .map((href) => [href]),
  )(
    "R1-02 %s shows its title as the one h1, says it isn't ready and offers Go to Today",
    async (href) => {
      const page = routes.get(href);
      if (page === undefined) throw new Error(`no page for ${href}`);
      const { default: Page, metadata } = await loadPage(page.file);
      renderWithUser(<Page />);
      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0]).toHaveTextContent(String(metadata?.title));
      expect(screen.getByText(SHELL_COPY.notReady)).toBeVisible();
      expect(
        screen.getByRole("link", { name: SHELL_COPY.goToToday }),
      ).toHaveAttribute("href", "/");
      // A placeholder is no page for search engines yet.
      expect(metadata?.robots).toEqual({ index: false });
    },
  );

  it("R1-09 gives each placeholder a title of its own, for the route announcer", async () => {
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
