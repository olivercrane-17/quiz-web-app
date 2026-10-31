import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

/**
 * Renders a component and returns a user-event session for it.
 * The session is created before rendering, as user-event recommends.
 *
 * @example
 * const { user } = renderWithUser(<AnswerButton label="Paris" />);
 * await user.click(screen.getByRole("button", { name: "Paris" }));
 */
export function renderWithUser(ui: ReactElement, options?: RenderOptions) {
  const user = userEvent.setup();
  return { user, ...render(ui, options) };
}
