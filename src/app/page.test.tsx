import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithUser } from "@/test/render";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders a single top-level heading", () => {
    renderWithUser(<HomePage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toBeVisible();
    expect(headings[0]).toHaveTextContent(/\S/);
  });

  it("puts its content inside the main landmark", () => {
    renderWithUser(<HomePage />);

    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { level: 1 }),
    );
  });
});
