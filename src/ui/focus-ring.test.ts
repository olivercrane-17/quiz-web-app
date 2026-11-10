import { afterEach, describe, expect, it, vi } from "vitest";

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

/** A finger on the screen. */
const touch = () => {
  window.dispatchEvent(
    Object.assign(new Event("pointerdown"), { pointerType: "touch" }),
  );
};
/** A device whose primary pointer is a finger, or a mouse. */
const primaryPointer = (kind: "coarse" | "fine") => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === `(pointer: ${kind})`,
    media: query,
  }));
};

afterEach(() => {
  document.body.replaceChildren();
  tap();
  vi.unstubAllGlobals();
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

  it("R5-01 a focus move after a touch is marked quiet, with no ring mark, until the focus leaves", () => {
    const group = heading();
    touch();
    focusWithRing(group, { preventScroll: true });
    expect(group).toHaveFocus();
    expect(group).not.toHaveAttribute("data-focus-ring");
    expect(group).toHaveAttribute("data-focus-quiet");
    group.blur();
    expect(group).not.toHaveAttribute("data-focus-quiet");
  });

  it("R5-01 a touch load is quiet too: no input yet, on a device whose primary pointer is a finger", () => {
    primaryPointer("coarse");
    const group = heading();
    focusWithRing(group);
    expect(group).toHaveAttribute("data-focus-quiet");
  });

  it("R5-01 a load with a mouse, or with nothing known of the pointer, keeps the browser's own ring", () => {
    const unknown = heading();
    focusWithRing(unknown);
    expect(unknown).not.toHaveAttribute("data-focus-quiet");
    primaryPointer("fine");
    const laptop = heading();
    focusWithRing(laptop);
    expect(laptop).not.toHaveAttribute("data-focus-quiet");
    // A mouse click on a touch-screen laptop is no touch either.
    tap();
    focusWithRing(unknown);
    expect(unknown).not.toHaveAttribute("data-focus-quiet");
  });

  it("R5-01 the first key press takes the quiet mark away, so a keyboard that joins in finds its ring", () => {
    const group = heading();
    touch();
    focusWithRing(group);
    expect(group).toHaveAttribute("data-focus-quiet");
    press({ key: "Shift" });
    expect(group).not.toHaveAttribute("data-focus-quiet");
    // And the next focus move wears the ring's own mark.
    const next = heading();
    focusWithRing(next);
    expect(next).toHaveAttribute("data-focus-ring");
    expect(next).not.toHaveAttribute("data-focus-quiet");
  });

  it("R5-01 only one element is quiet at a time", () => {
    touch();
    const first = heading();
    const second = heading();
    focusWithRing(first);
    focusWithRing(second);
    expect(first).not.toHaveAttribute("data-focus-quiet");
    expect(second).toHaveAttribute("data-focus-quiet");
  });

  it("ignores a missing element", () => {
    expect(() => {
      focusWithRing(null);
    }).not.toThrow();
  });
});
