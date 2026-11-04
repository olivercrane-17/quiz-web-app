import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MIN_SHEET_BODY_PX,
  focusIsElsewhere,
  keepSheetInView,
  keepTopBelowHeader,
  topInset,
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

describe("R1-21 the explanation sheet on screen", () => {
  function sheetWithBody() {
    const header = element("header", "header");
    header.style.position = "sticky";
    const sheet = element("section", "sheet");
    const body = element("div", "body", sheet);
    return { sheet, body };
  }

  it("moves nothing when the sheet fits below the options", () => {
    const { sheet, body } = sheetWithBody();
    layout({
      header: { top: 0, bottom: 56, height: 56 },
      sheet: { top: 500, bottom: 840, height: 340 },
    });
    keepSheetInView(sheet, body);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(body.style.maxHeight).toBe("");
  });

  it("scrolls the page just enough to show all of a sheet that runs off the bottom", () => {
    const { sheet, body } = sheetWithBody();
    layout({
      header: { top: 0, bottom: 56, height: 56 },
      sheet: { top: 560, bottom: 900, height: 340 },
    });
    keepSheetInView(sheet, body);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: 56,
      behavior: "instant",
    });
    // It fits under the header once scrolled, so its body doesn't scroll.
    expect(body.style.maxHeight).toBe("");
    expect(body.tabIndex).toBe(-1);
  });

  it("D12 lets the body of a sheet taller than the screen scroll inside it, so the title and Continue stay in view", () => {
    const { sheet, body } = sheetWithBody();
    vi.spyOn(body, "clientHeight", "get").mockReturnValue(520);
    let shrunk = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.box === "header") {
          return { top: 0, bottom: 56, height: 56 } as DOMRect;
        }
        if (this.dataset.box === "sheet") {
          // 900 px tall at first; 900 - (900 - 788) = 788 once its body is held.
          shrunk = body.style.maxHeight !== "";
          return (
            shrunk
              ? { top: 600, bottom: 1388, height: 788 }
              : { top: 600, bottom: 1500, height: 900 }
          ) as DOMRect;
        }
        return { top: 0, bottom: 0, height: 0 } as DOMRect;
      },
    );
    keepSheetInView(sheet, body);
    // The room under the header is 844 - 56 = 788: the body gives up 112 px.
    expect(body.style.maxHeight).toBe("408px");
    expect(body.style.overflowY).toBe("auto");
    expect(body.tabIndex).toBe(0);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: 1388 - 844,
      behavior: "instant",
    });
  });

  it("never holds the body below its floor", () => {
    const { sheet, body } = sheetWithBody();
    vi.spyOn(body, "clientHeight", "get").mockReturnValue(150);
    layout({
      header: { top: 0, bottom: 56, height: 56 },
      sheet: { top: 600, bottom: 1600, height: 1000 },
    });
    keepSheetInView(sheet, body);
    expect(body.style.maxHeight).toBe(`${MIN_SHEET_BODY_PX}px`);
  });

  it("does nothing without layout", () => {
    const { sheet, body } = sheetWithBody();
    keepSheetInView(sheet, body);
    keepSheetInView(null, null);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe("R1-14 where focus is", () => {
  it("is nowhere in particular on the page itself or inside the round", () => {
    const round = element("div", "round");
    const option = element("button", "option", round);
    expect(focusIsElsewhere(round)).toBe(false);
    option.focus();
    expect(focusIsElsewhere(round)).toBe(false);
  });

  it("is elsewhere on a control outside the round, unless that control is hidden", () => {
    const round = element("div", "round");
    const wrapper = element("div", "wrapper");
    const leave = element("a", "leave", wrapper) as HTMLAnchorElement;
    leave.href = "/";
    leave.focus();
    expect(focusIsElsewhere(round)).toBe(true);
    wrapper.style.display = "none";
    expect(focusIsElsewhere(round)).toBe(false);
  });
});
