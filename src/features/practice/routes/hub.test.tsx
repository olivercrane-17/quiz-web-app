import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PRACTICE_COPY } from "../copy";
import PracticeHubRoute from "./hub";

/** No run is open: Quick play keeps its own label. */
vi.mock("../open-run", () => ({
  openRunLabel: () => Promise.resolve(null),
}));

describe("the Practice hub", () => {
  it("R2-05 says choosing a category and a difficulty is coming soon, never that it comes next", async () => {
    const { container } = render(<PracticeHubRoute />);
    // Let Quick play's island settle on its label.
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    const hub = container.querySelector("[data-practice-hub]");
    expect(PRACTICE_COPY.hub.later).toBe(
      "Coming soon: choose a category and a difficulty.",
    );
    expect(
      screen.getByText("Coming soon: choose a category and a difficulty."),
    ).toBeVisible();
    // Priya read "comes next" as the step after Quick play, one she'd skipped.
    expect(hub?.textContent).not.toMatch(/comes next/i);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Practice",
    );
    expect(screen.getByRole("link", { name: "Quick play" })).toHaveAttribute(
      "href",
      "/practice/run",
    );
  });
});
