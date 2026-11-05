import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithUser } from "@/test/render";

import { SHELL_ROUTES, shellPath } from "./shell-routes";
import { TabList } from "./tab-list";
import { TABS, tabForPath } from "./tabs";

describe("tabForPath", () => {
  it.each([
    ["/", { tab: "today", exact: true }],
    ["/practice", { tab: "practice", exact: true }],
    ["/g", { tab: "groups", exact: true }],
    ["/me", { tab: "me", exact: true }],
    ["/me/", { tab: "me", exact: true }],
    ["/archive", { tab: "today", exact: false }],
    ["/categories/geography", { tab: "practice", exact: false }],
    ["/g/new", { tab: "groups", exact: false }],
    [
      "/g/0f8fad5b-d9cb-469f-a165-70867728950e",
      { tab: "groups", exact: false },
    ],
    ["/me/achievements", { tab: "me", exact: false }],
    ["/me/sync", { tab: "me", exact: false }],
    ["/challenges", { tab: "me", exact: false }],
    ["/create/import", { tab: "me", exact: false }],
  ] as const)("%s belongs to %o", (path, expected) => {
    expect(tabForPath(path)).toEqual(expected);
  });

  it.each(["/daily", "/practice-run", "/gallery", "/s/42/a1b2", ""])(
    "%s belongs to no tab",
    (path) => {
      expect(tabForPath(path)).toBeNull();
    },
  );

  it.each(["/settings", "/settings/"])(
    "R2-34 %s marks no tab: the gear opens it from every tab, not from Me",
    (path) => {
      expect(tabForPath(path)).toBeNull();
    },
  );

  it("is null before the router knows the path", () => {
    expect(tabForPath(null)).toBeNull();
  });

  it("picks the same tab for a tab-group shell and the address it serves", () => {
    // A rewritten page is prerendered at /shell/<name> and hydrates at the
    // original address; both must mark the same tab, or hydration mismatches.
    const examples: Record<string, string> = {
      group: "/g/0f8fad5b-d9cb-469f-a165-70867728950e",
      "group-settings": "/g/0f8fad5b-d9cb-469f-a165-70867728950e/settings",
      editor: "/create/0f8fad5b-d9cb-469f-a165-70867728950e",
    };
    const tabShells = SHELL_ROUTES.filter((route) => route.group === "tabs");
    expect(tabShells.map((route) => route.shell).sort()).toEqual(
      Object.keys(examples).sort(),
    );
    for (const route of tabShells) {
      const address = examples[route.shell] ?? "";
      expect(tabForPath(shellPath(route.shell))?.tab).toBe(
        tabForPath(address)?.tab,
      );
      expect(tabForPath(address)).not.toBeNull();
    }
  });
});

describe("TABS", () => {
  it("R1-09 prefetch every destination, each with a page now, so its title lands with it", () => {
    // /practice too, since FIX-PRA's greybox hub merged.
    expect(TABS.filter((tab) => tab.prefetch).map((tab) => tab.id)).toEqual([
      "today",
      "practice",
      "groups",
      "me",
    ]);
  });
});

describe("TabList", () => {
  it("lists the four destinations in order, by name", () => {
    renderWithUser(<TabList active={null} placement="bottom" />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      TABS.map((tab) => tab.label),
    );
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks the current page, or the current section below a tab", () => {
    const { rerender } = renderWithUser(
      <TabList active={{ tab: "groups", exact: true }} placement="top" />,
    );
    expect(screen.getByRole("link", { name: "Groups" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    rerender(<TabList active={{ tab: "me", exact: false }} placement="top" />);
    const me = screen.getByRole("link", { name: "Me" });
    expect(me).toHaveAttribute("aria-current", "true");
    expect(me).toHaveAttribute("data-active");
    // The marker bar is decorative; the name stays the label.
    expect(me).toHaveAccessibleName("Me");
    expect(
      within(me).getByText("", { selector: "[aria-hidden]" }),
    ).toBeEmptyDOMElement();
    expect(screen.getByRole("link", { name: "Groups" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
