import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import { AppHeader } from "./app-header";
import { SiteFooter } from "./footer";
import { PlayHeader } from "./play-header";
import { TabList } from "./tab-list";
import { TopBarTitle } from "./top-bar-title";
import { Wordmark } from "./wordmark";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("the shell's chrome", () => {
  it("the wordmark is the newt and the lowercase name, linking home as Knewt", () => {
    renderWithUser(<Wordmark />);
    const link = screen.getByRole("link", { name: "Knewt" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveTextContent("knewt");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("the top bar names its icon-only Settings link", () => {
    renderWithUser(<AppHeader />);
    const banner = screen.getByRole("banner");
    const settings = within(banner).getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "/settings");
    expect(settings).toHaveTextContent("");
    expect(settings.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    // The text tabs for wide screens sit in the same bar.
    expect(
      within(banner).getByRole("navigation", { name: "Main" }),
    ).toHaveAttribute("data-placement", "top");
  });

  it("bottom tabs show an icon over each label; top tabs the label alone", () => {
    const { unmount } = renderWithUser(
      <TabList active={{ tab: "today", exact: true }} placement="bottom" />,
    );
    for (const link of screen.getAllByRole("link")) {
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    unmount();
    renderWithUser(<TabList active={null} placement="top" />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.querySelector("svg")).toBeNull();
    }
  });

  it("the play header names Leave, which shows only an X, and holds the run's progress", () => {
    renderWithUser(
      <PlayHeader
        leave={{ href: "/", label: "Leave the Daily. Your progress is saved" }}
        progress={<ol aria-label="Daily progress" />}
        end={<p>0:42</p>}
      />,
    );
    const leave = screen.getByRole("link", {
      name: "Leave the Daily. Your progress is saved",
    });
    expect(leave).toHaveAttribute("href", "/");
    expect(leave).toHaveClass("kn-btn", "kn-btn-icon");
    expect(screen.getByRole("list", { name: "Daily progress" })).toBeVisible();
    expect(screen.getByText("0:42")).toBeVisible();
    expect(
      screen.getByRole("banner").querySelector(".kn-playbar-below"),
    ).toBeNull();
    // With an end slot, the row keeps the icon buttons' insets.
    expect(
      screen.getByRole("banner").querySelector(".kn-playbar-row"),
    ).not.toHaveAttribute("data-end");
  });

  it("R1-36 without an end slot, the play header's progress keeps the page's gutter on the right", () => {
    renderWithUser(
      <PlayHeader
        leave={{ href: "/", label: "Leave practice. This run won't count" }}
        progress={
          <ol aria-label="Question 1 of 10. 0 right, 0 wrong so far." />
        }
      />,
    );
    // shell.css pads `[data-end="none"]` by the gutter on its right.
    expect(
      screen.getByRole("banner").querySelector(".kn-playbar-row"),
    ).toHaveAttribute("data-end", "none");
  });

  it("R1-12 both bars report their height for the page's scroll padding", () => {
    renderWithUser(
      <>
        <AppHeader />
        <PlayHeader leave={{ href: "/", label: "Leave" }} />
      </>,
    );
    for (const banner of screen.getAllByRole("banner")) {
      expect(
        banner.querySelector(':scope > [data-scroll-inset="top"]'),
      ).not.toBeNull();
    }
  });

  it("the play header runs a row under the bar when the screen gives one", () => {
    renderWithUser(
      <PlayHeader
        leave={{ href: "/", label: "Leave practice. This run won't count" }}
        progress={<p>Practice</p>}
        below={<ol aria-label="Question 4 of 10. 3 right, 0 wrong so far." />}
      />,
    );
    const below = screen
      .getByRole("banner")
      .querySelector<HTMLElement>(".kn-playbar-below");
    expect(below).not.toBeNull();
    expect(
      within(below as HTMLElement).getByRole("list", {
        name: "Question 4 of 10. 3 right, 0 wrong so far.",
      }),
    ).toBeVisible();
    // Under the row, never inside it.
    expect(below?.previousElementSibling).toHaveClass("kn-playbar-row");
  });

  it("a tab page's title takes the wordmark's place in the top bar while it is mounted", () => {
    const { rerender, unmount } = renderWithUser(
      <>
        <AppHeader />
        <TopBarTitle title="Uni lot" meta="12 members" />
      </>,
    );
    const banner = screen.getByRole("banner");
    expect(banner).toHaveAttribute("data-titled", "");
    const slot = banner.querySelector<HTMLElement>("[data-topbar-title]");
    expect(slot).toHaveTextContent("Uni lot12 members");
    // Not a heading: the page keeps its own h1.
    expect(within(banner).queryByRole("heading")).toBeNull();
    // Settings stays at the right until the page brings its own end.
    expect(
      within(banner).getByRole("link", { name: "Settings" }),
    ).toBeInTheDocument();

    rerender(
      <>
        <AppHeader />
        <TopBarTitle
          title="Uni lot"
          start={<a href="/g">Back to your Groups</a>}
          end={<a href="/g/1/settings">Group settings</a>}
        />
      </>,
    );
    expect(banner).toHaveAttribute("data-titled", "own-end");
    expect(
      within(slot as HTMLElement)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Back to your Groups", "Group settings"]);

    unmount();
    renderWithUser(<AppHeader />);
    expect(screen.getByRole("banner")).not.toHaveAttribute("data-titled");
    expect(
      screen.getByRole("banner").querySelector("[data-topbar-title]"),
    ).toBeEmptyDOMElement();
  });

  it("a title outside the tab pages' layout renders nothing", () => {
    const { container } = renderWithUser(<TopBarTitle title="Practice" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("the footer's links are the seven trust pages, in DESIGN's order", () => {
    renderWithUser(<SiteFooter />);
    const footer = screen.getByRole("navigation", { name: "About Knewt" });
    expect(
      within(footer)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/how-scoring-works",
      "/about-our-questions",
      "/privacy",
      "/terms",
      "/content-policy",
      "/accessibility",
      "/credits",
    ]);
  });
});
