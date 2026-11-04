import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import TabsLayout from "../layout";
import PracticePage, { metadata } from "./page";

// The Quick play island asks after first paint whether a run is open.
vi.mock("@/features/practice/open-run", () => ({
  openRunLabel: () => Promise.resolve(null),
}));

async function renderPractice() {
  const view = renderWithUser(
    <TabsLayout>
      <PracticePage />
    </TabsLayout>,
  );
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  return view;
}

describe("the practice page, /practice", () => {
  it("R1-02 is a page inside the tabs layout, not a bare 404: one h1, the Main navigation and a way to Today", async () => {
    await renderPractice();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Practice");
    expect(screen.getByRole("main")).toContainElement(headings[0] ?? null);
    // One bar for phones and one for wide screens; CSS shows one of them.
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
    expect(
      within(screen.getByRole("main")).getByRole("link", {
        name: "Go to Today",
      }),
    ).toHaveAttribute("href", "/");
    expect(document.body).not.toHaveTextContent("This page could not be found");
  });

  it("R1-02 holds the Quick play card, which starts a run", async () => {
    await renderPractice();

    const main = within(screen.getByRole("main"));
    expect(main.getByRole("link", { name: "Quick play" })).toHaveAttribute(
      "href",
      "/practice/run",
    );
    expect(screen.getByRole("main")).toHaveTextContent(
      "Ten questions on anything, at every level. Untimed.",
    );
  });

  it("R1-15 promises nothing about offline play", async () => {
    await renderPractice();
    expect(screen.getByRole("main").textContent).not.toMatch(/offline/i);
  });

  it("is titled Practice", () => {
    expect(metadata.title).toBe("Practice");
  });
});
