import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithUser } from "@/test/render";

import { SkipLink } from "./skip-link";

afterEach(() => {
  delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
});

describe("SkipLink", () => {
  it("moves focus to the main content that is shown, past a hidden route's copy", async () => {
    // jsdom has no layout: in this stand-in, a hidden ancestor hides.
    Object.defineProperty(Element.prototype, "checkVisibility", {
      configurable: true,
      value(this: Element) {
        return this.closest("[hidden]") === null;
      },
    });
    const { user } = renderWithUser(
      <>
        <SkipLink />
        <div hidden>
          <main id="main" tabIndex={-1}>
            Previous route, kept mounted
          </main>
        </div>
        <main id="main" tabIndex={-1} data-testid="current">
          Current route
        </main>
      </>,
    );
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveAttribute("href", "#main");
    await user.click(skip);
    expect(screen.getByTestId("current")).toHaveFocus();
  });
});
