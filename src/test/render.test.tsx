import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "./render";

describe("renderWithUser", () => {
  it("returns a user-event session wired to the rendered tree", async () => {
    const onClick = vi.fn();
    const { user } = renderWithUser(
      <button type="button" onClick={onClick}>
        Press
      </button>,
    );

    await user.click(screen.getByRole("button", { name: "Press" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("supports keyboard interaction", async () => {
    const { user } = renderWithUser(<input aria-label="Answer" />);

    await user.tab();
    await user.keyboard("Paris");

    const input = screen.getByRole("textbox", { name: "Answer" });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("Paris");
  });
});
