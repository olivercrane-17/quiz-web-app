import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  focusReveal,
  keepRevealInView,
  keepTopBelowHeader,
  topInset,
  visibleArea,
} from "./viewport";

type Box = { top: number; bottom: number; height: number };

/** Gives elements the boxes a laid-out page would, by `data-box`. */
function layout(boxes: Record<string, Box>) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const box = boxes[this.dataset.box ?? ""];
      return (box ?? { top: 0, bottom: 0, height: 0 }) as DOMRect;
    },
  );
}

function element(
  tag: string,
  box: string,
  parent: HTMLElement = document.body,
) {
  const node = document.createElement(tag);
  node.dataset.box = box;
  parent.append(node);
  return node;
}

let scrollBy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollBy = vi.fn();
  vi.stubGlobal("scrollBy", scrollBy);
  vi.stubGlobal("innerHeight", 844);
});

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.style.scrollPaddingTop = "";
});

describe("the header inset", () => {
  it("reaches the bottom of a sticky or fixed header at the top edge", () => {
    const header = element("header", "header");
    header.style.position = "sticky";
    layout({ header: { top: 0, bottom: 57, height: 57 } });
    expect(topInset()).toBe(57);
  });

  it("ignores a header that scrolls with the page, is hidden or isn't at the top", () => {
    element("header", "plain");
    const hidden = element("header", "hidden");
    hidden.style.position = "fixed";
    const lower = element("header", "lower");
    lower.style.position = "sticky";
    layout({
      plain: { top: 0, bottom: 80, height: 80 },
      hidden: { top: 0, bottom: 0, height: 0 },
      lower: { top: 200, bottom: 260, height: 60 },
    });
    expect(topInset()).toBe(0);
  });

  it("takes the page's scroll padding when that is larger", () => {
    document.documentElement.style.scrollPaddingTop = "72px";
    const header = element("header", "header");
    header.style.position = "sticky";
    layout({ header: { top: 0, bottom: 57, height: 57 } });
    expect(topInset()).toBe(72);
  });
});

describe("R1-12 the question's top", () => {
  it("scrolls back up just enough to sit below the header, with the gap", () => {
    const header = element("header", "header");
    header.style.position = "sticky";
    const question = element("div", "question");
    layout({
      header: { top: 0, bottom: 56, height: 56 },
      question: { top: 30, bottom: 530, height: 500 },
    });
    keepTopBelowHeader(question);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: -42,
      behavior: "instant",
    });
  });

  it("leaves a question that already starts below the header where it is", () => {
    const header = element("header", "header");
    header.style.position = "sticky";
    const question = element("div", "question");
    layout({
      header: { top: 0, bottom: 56, height: 56 },
      question: { top: 120, bottom: 620, height: 500 },
    });
    keepTopBelowHeader(question);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does nothing without layout", () => {
    keepTopBelowHeader(element("div", "none"));
    keepTopBelowHeader(null);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe("the visible area", () => {
  it("runs from under the header to the bottom of the visual viewport", () => {
    const header = element("header", "header");
    header.style.position = "sticky";
    layout({ header: { top: 0, bottom: 57, height: 57 } });
    expect(visibleArea()).toEqual({ top: 57, bottom: 844 });
    // A page wider than the phone: the layout viewport is taller than the
    // screen, and the visual viewport may sit lower in it.
    vi.stubGlobal("innerHeight", 945);
    vi.stubGlobal("visualViewport", { offsetTop: 40, height: 839 });
    expect(visibleArea()).toEqual({ top: 57, bottom: 879 });
    vi.stubGlobal("visualViewport", { offsetTop: 90, height: 839 });
    expect(visibleArea()).toEqual({ top: 90, bottom: 929 });
  });
});

describe("R1-12 a reveal under the sticky header", () => {
  /** The play header, and a reveal card with its heading inside. */
  function reveal(card: Box, heading: Box) {
    const header = element("header", "header");
    header.style.position = "sticky";
    const section = element("section", "card");
    const title = element("h1", "heading", section);
    title.tabIndex = -1;
    layout({ header: { top: 0, bottom: 57, height: 57 }, card, heading });
    return { section, title };
  }

  it("scrolls back up so a card that starts above the screen starts below the header, with the gap", () => {
    // 640 by 400 at 200% zoom: the reveal took the clue screen's place, and
    // the page kept the scroll that showed the options.
    const { section, title } = reveal(
      { top: -96, bottom: 604, height: 700 },
      { top: 0, bottom: 30, height: 30 },
    );
    keepRevealInView(section, title);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: -169,
      behavior: "instant",
    });
  });

  it("scrolls back a card whose top sits under the header, though its heading shows", () => {
    const { section, title } = reveal(
      { top: 30, bottom: 730, height: 700 },
      { top: 120, bottom: 150, height: 30 },
    );
    keepRevealInView(section, title);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: -43,
      behavior: "instant",
    });
  });

  it("leaves a card that starts below the header with its heading on screen where it is", () => {
    const { section, title } = reveal(
      { top: 73, bottom: 773, height: 700 },
      { top: 160, bottom: 190, height: 30 },
    );
    keepRevealInView(section, title);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("scrolls down just enough to show a heading below the screen, never taking the card's top under the header", () => {
    const { section, title } = reveal(
      { top: 300, bottom: 1300, height: 1000 },
      { top: 830, bottom: 870, height: 40 },
    );
    keepRevealInView(section, title);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: 42,
      behavior: "instant",
    });
    scrollBy.mockClear();
    const far = reveal(
      { top: 100, bottom: 1300, height: 1200 },
      { top: 1000, bottom: 1040, height: 40 },
    );
    keepRevealInView(far.section, far.title);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: 27,
      behavior: "instant",
    });
  });

  it("focuses the heading without the browser's own scroll, then lines the card up", () => {
    const { section, title } = reveal(
      { top: -96, bottom: 604, height: 700 },
      { top: 0, bottom: 30, height: 30 },
    );
    const focus = vi.spyOn(title, "focus");
    focusReveal(title, section);
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(title).toHaveFocus();
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: -169,
      behavior: "instant",
    });
  });

  it("does nothing without layout", () => {
    const section = element("section", "none");
    keepRevealInView(section);
    keepRevealInView(null);
    focusReveal(null, section);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
