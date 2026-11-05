import { afterEach, describe, expect, it } from "vitest";

import { focusWithRing, lastInputWasKeyboard } from "./focus-ring";

function heading(): HTMLHeadingElement {
  const element = document.createElement("h1");
  element.tabIndex = -1;
  element.textContent = "Which planet has the most moons?";
  document.body.append(element);
  return element;
}

const press = (init: KeyboardEventInit) => {
  window.dispatchEvent(new KeyboardEvent("keydown", init));
};
const tap = () => {
  window.dispatchEvent(new Event("pointerdown"));
};

afterEach(() => {
  document.body.replaceChildren();
  tap();
});

describe("focusWithRing", () => {
  it("R1-34 marks a focus move that follows a key press, in every browser, until the focus leaves", () => {
    const stem = heading();
    press({ key: "Enter" });
    expect(lastInputWasKeyboard()).toBe(true);
    focusWithRing(stem, { preventScroll: true });
    expect(stem).toHaveFocus();
    expect(stem).toHaveAttribute("data-focus-ring");

    const next = heading();
    focusWithRing(next);
    expect(stem).not.toHaveAttribute("data-focus-ring");
    expect(next).toHaveAttribute("data-focus-ring");
  });

  it("leaves a focus move that follows a tap unmarked", () => {
    const stem = heading();
    press({ key: "a" });
    tap();
    focusWithRing(stem);
    expect(stem).toHaveFocus();
    expect(stem).not.toHaveAttribute("data-focus-ring");
  });

  it("doesn't count a shortcut held with a modifier as keyboard navigation", () => {
    const stem = heading();
    press({ key: "c", ctrlKey: true });
    focusWithRing(stem);
    expect(stem).not.toHaveAttribute("data-focus-ring");
  });

  it("ignores a missing element", () => {
    expect(() => {
      focusWithRing(null);
    }).not.toThrow();
  });
});
