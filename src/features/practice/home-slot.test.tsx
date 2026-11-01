import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PracticeHomeSlot } from "./home-slot";
import { PRACTICE_INTENT_KEY } from "./intent";

afterEach(() => {
  sessionStorage.clear();
});

describe("Today's Practice card", () => {
  it("is a titled card with Quick play linking to the run", () => {
    render(<PracticeHomeSlot placement="regular" />);
    const card = screen.getByRole("region", { name: "Practice" });
    expect(card).toHaveTextContent("Ten questions on anything. Works offline.");
    const link = within(card).getByRole("link", { name: "Quick play" });
    expect(link).toHaveAttribute("href", "/practice/run");
  });

  it("keeps each copy's title id apart, since Today renders the card twice", () => {
    render(
      <>
        <PracticeHomeSlot placement="promoted" />
        <PracticeHomeSlot placement="regular" />
      </>,
    );
    const ids = screen
      .getAllByRole("region", { name: "Practice" })
      .map((card) => card.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
  });

  it("leaves the Quick play request for the run screen on a plain click", () => {
    render(<PracticeHomeSlot placement="regular" />);
    const link = screen.getByRole("link", { name: "Quick play" });
    // Stop the navigation itself; only the request matters here.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link, { button: 0 });
    expect(
      JSON.parse(sessionStorage.getItem(PRACTICE_INTENT_KEY) ?? "null"),
    ).toEqual({
      v: 1,
      mode: "quick",
      category: "mixed",
      difficulty: "mixed",
    });
  });

  it("leaves nothing behind when the link opens in a new tab or window", () => {
    render(<PracticeHomeSlot placement="regular" />);
    const link = screen.getByRole("link", { name: "Quick play" });
    link.addEventListener("click", (event) => event.preventDefault());
    for (const modifier of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
    ]) {
      fireEvent.click(link, { button: 0, ...modifier });
    }
    expect(sessionStorage.getItem(PRACTICE_INTENT_KEY)).toBeNull();
  });
});
