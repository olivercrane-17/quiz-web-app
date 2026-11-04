import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import { AppHeader } from "./app-header";
import { SiteFooter } from "./footer";
import { PlayHeader } from "./play-header";
import { TabList } from "./tab-list";
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
