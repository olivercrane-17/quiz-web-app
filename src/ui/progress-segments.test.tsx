import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithUser } from "@/test/render";

import { markFit } from "./mark-fit";
import { ProgressSegments } from "./progress-segments";

describe("ProgressSegments", () => {
  it("names the list and each step, and marks the current one", () => {
    renderWithUser(
      <ProgressSegments
        label="Daily progress"
        segments={[
          { status: "correct", label: "Mystery 1, solved on clue 1" },
          {
            status: "upcoming",
            current: true,
            mark: "2",
            label: "Mystery 2, playing now",
          },
          { status: "upcoming", mark: "3", label: "Mystery 3" },
          { status: "upcoming", mark: "E", label: "Encore" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Daily progress" });
    // Explicit, so WebKit keeps the role and the name under list-style: none.
    expect(list).toHaveAttribute("role", "list");
    const steps = within(list).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "Mystery 1, solved on clue 1",
      "2Mystery 2, playing now",
      "3Mystery 3",
      "EEncore",
    ]);
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[0]).not.toHaveAttribute("aria-current");
    // The visible marks are decorative; the labels are what screen readers hear.
    expect(steps[1]?.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "2",
    );
  });

  it("shows a glyph for each resolved status, or the points when given", () => {
    renderWithUser(
      <ProgressSegments
        label="Question 4 of 10. 2 right, 1 wrong so far."
        variant="bar"
        segments={[
          { status: "correct", label: "Question 1, right" },
          { status: "wrong", label: "Question 2, wrong" },
          { status: "voided", label: "Question 3, withdrawn" },
          { status: "correct", mark: "3", label: "Mystery 1, 3 points" },
          { status: "done", current: true, label: "Encore, locked in" },
        ]}
      />,
    );
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((step) => step.getAttribute("data-status"))).toEqual([
      "correct",
      "wrong",
      "voided",
      "correct",
      "done",
    ]);
    for (const step of steps.slice(0, 3)) {
      expect(step.querySelector("svg")).not.toBeNull();
    }
    expect(steps[3]?.querySelector("svg")).toBeNull();
    expect(steps[3]).toHaveTextContent("3");
    expect(steps[4]).toHaveAttribute("data-current");
    expect(
      screen.getByRole("list", {
        name: "Question 4 of 10. 2 right, 1 wrong so far.",
      }),
    ).toHaveAttribute("data-variant", "bar");
  });

  it("R2-06 steps a longer mark's type down, by character, so the Encore's % off fits its pill", () => {
    expect(markFit(undefined)).toBeUndefined();
    for (const mark of ["E", "M3", "+4", "🎯", "4%"]) {
      expect(markFit(mark), mark).toBeUndefined();
    }
    expect(markFit("13%")).toBe("snug");
    expect(markFit("<1%")).toBe("snug");
    expect(markFit("100%")).toBe("tight");
    renderWithUser(
      <ProgressSegments
        label="Daily progress"
        segments={[
          { status: "correct", mark: "+4", label: "Mystery 1, 4 points" },
          { status: "wrong", label: "Mystery 2, missed" },
          { status: "voided", mark: "M3", label: "Mystery 3, withdrawn" },
          { status: "done", current: true, mark: "13%", label: "Encore" },
        ]}
      />,
    );
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((step) => step.getAttribute("data-fit"))).toEqual([
      null,
      null,
      // A withdrawn round shows its dash, never its mark.
      null,
      "snug",
    ]);
  });
});
