/**
 * How to play as a sheet over the Daily (PRD §3.1.3, AC-DLY-30), which
 * links to `/how-scoring-works`, the page that carries the same text with
 * the rest of the rules (FIX-DS, R1-02).
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HOW_SCORING_WORKS_HREF, HowToPlaySheet } from "./how-to-play-sheet";

describe("the How to play sheet", () => {
  it("AC-DLY-30 shows the five parts, then a link to How scoring works", () => {
    render(<HowToPlaySheet open onClose={() => {}} />);
    const sheet = screen.getByRole("dialog", { name: "How to play" });
    expect(
      within(sheet)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "The clue ladder",
      "The points",
      "Clue 4",
      "The Encore",
      "The ranking",
    ]);
    const link = within(sheet).getByRole("link", {
      name: "How scoring works",
    });
    expect(link).toHaveAttribute("href", "/how-scoring-works");
    expect(HOW_SCORING_WORKS_HREF).toBe("/how-scoring-works");
  });
});
