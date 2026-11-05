import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import TabsLayout from "./layout";
import HomePage from "./page";

// Today asks the router whether it arrived by a push (HomeArrival).
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ bfcacheId: "_b_1_" }),
}));

function renderHome() {
  return renderWithUser(
    <TabsLayout>
      <HomePage />
    </TabsLayout>,
  );
}

beforeEach(() => {
  // A client render is a push arrival, which scrolls to the top
  // (@/features/home/arrival.test.tsx); jsdom has no scrolling.
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("HomePage", () => {
  it("renders a single top-level heading", () => {
    renderHome();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toBeVisible();
    expect(headings[0]).toHaveTextContent(/\S/);
  });

  it("puts its content inside the main landmark", () => {
    renderHome();

    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { level: 1 }),
    );
  });

  it("greets by the device's local time, with the date above", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 8, 30), toFake: ["Date"] });
    renderHome();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Good morning.",
    );
    expect(screen.getByText("Sunday 1 November")).toBeInTheDocument();
  });

  it("R1-35 says Hello. just after midnight (D18), in the greeting's rem-sized token", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 0, 32), toFake: ["Date"] });
    renderHome();

    const greeting = screen.getByRole("heading", { level: 1 });
    expect(greeting).toHaveTextContent("Hello.");
    // display-2 is in rem, so at 200% text the h1 outgrows the h2s (R1-34).
    expect(greeting).toHaveClass("text-display-2");
  });

  it("R1-35 tells a newcomer what the Daily asks, under the greeting, and nobody else (D18)", async () => {
    const { resetIntroForTests } = await import("@/features/home/intro");
    resetIntroForTests();
    const first = renderHome();
    const line = screen.getByText(
      "Name the mystery in as few clues as you can.",
    );
    expect(line).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1 }).compareDocumentPosition(line) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    first.unmount();

    // A device that already holds an identity has been here before.
    localStorage.setItem("qz:identity", "{}");
    resetIntroForTests();
    renderHome();
    expect(
      screen.getByText("Name the mystery in as few clues as you can."),
    ).not.toBeVisible();
  });

  it("offers the four tab destinations by name", () => {
    renderHome();

    // One bar for phones and one for wide screens; CSS shows one of them.
    const bars = screen.getAllByRole("navigation", { name: "Main" });
    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      const links = within(bar).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([
        "Today",
        "Practice",
        "Groups",
        "Me",
      ]);
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "/",
        "/practice",
        "/g",
        "/me",
      ]);
    }
  });

  it("links the seven legal and trust pages from the footer", () => {
    renderHome();

    const footer = screen.getByRole("navigation", { name: "About Knewt" });
    expect(within(footer).getAllByRole("link")).toHaveLength(7);
  });

  it("starts with a skip link to the main content", () => {
    renderHome();

    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });
});
