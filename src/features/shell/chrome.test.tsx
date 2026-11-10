import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import { AppHeader } from "./app-header";
import { SiteFooter } from "./footer";
import { PlayHeader, leaveTip } from "./play-header";
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

  describe("the X's tooltip (RITE round 4, R4-04)", () => {
    const RUNNING =
      "Leave the Daily. Your progress is saved, and the stopwatch keeps running.";
    const tip = () =>
      screen.getByRole("banner").querySelector<HTMLElement>("[data-leave-tip]");

    it("R4-04 the play header's X carries a tooltip with its label's second sentence, beside the link", () => {
      renderWithUser(<PlayHeader leave={{ href: "/", label: RUNNING }} />);
      const leave = screen.getByRole("link", { name: RUNNING });
      expect(tip()).toHaveTextContent(
        /^Your progress is saved, and the stopwatch keeps running\.$/,
      );
      // The X's sibling, in the box whose hover and focus show it, and
      // never inside the link: a click on the words doesn't leave.
      expect(tip()?.parentElement).toHaveClass("kn-playbar-leave");
      expect(tip()?.previousElementSibling).toBe(leave);
      expect(leave.contains(tip())).toBe(false);
      // The link keeps its name; the tooltip only repeats part of it.
      expect(tip()).toHaveAttribute("aria-hidden", "true");
      expect(leave).toHaveAccessibleName(RUNNING);
    });

    it("R4-04 a label of one sentence gets no tooltip", () => {
      renderWithUser(
        <PlayHeader leave={{ href: "/", label: "Leave practice" }} />,
      );
      expect(tip()).toBeNull();
      expect(leaveTip("Leave practice")).toBeNull();
      expect(leaveTip("Leave practice.")).toBeNull();
      expect(leaveTip("Leave the Daily. Your progress is saved.")).toBe(
        "Your progress is saved.",
      );
      expect(leaveTip("Leave practice. This run won't count")).toBe(
        "This run won't count",
      );
    });

    it("R4-04 Escape puts the tooltip away without moving focus, and it returns with the pointer or focus (WCAG 1.4.13)", () => {
      renderWithUser(<PlayHeader leave={{ href: "/", label: RUNNING }} />);
      const leave = screen.getByRole("link", { name: RUNNING });
      leave.focus();
      expect(tip()).not.toHaveAttribute("data-off");
      fireEvent.keyDown(leave, { key: "Escape" });
      expect(tip()).toHaveAttribute("data-off");
      expect(leave).toHaveFocus();
      fireEvent.pointerEnter(leave.parentElement as HTMLElement);
      expect(tip()).not.toHaveAttribute("data-off");
      // Hovered without focus: Escape reaches it from the page.
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(tip()).toHaveAttribute("data-off");
      fireEvent.focusIn(leave);
      expect(tip()).not.toHaveAttribute("data-off");
      // Any other key leaves it be.
      fireEvent.keyDown(leave, { key: "a" });
      expect(tip()).not.toHaveAttribute("data-off");
    });

    it("R4-04 shell.css shows the tooltip on hover and on focus, hides it otherwise, and Escape's mark wins", () => {
      const css = readFileSync(
        resolve(process.cwd(), "src/features/shell/shell.css"),
        "utf8",
      );
      const hidden = /\.kn-playbar-tip \{[^}]*visibility: hidden;[^}]*\}/;
      expect(css).toMatch(hidden);
      expect(css).toContain(
        ".kn-playbar-leave:focus-within > .kn-playbar-tip:not([data-off])",
      );
      expect(css).toMatch(
        /@media \(hover: hover\) \{\s*\.kn-playbar-leave:hover > \.kn-playbar-tip:not\(\[data-off\]\)/,
      );
    });
  });
});
