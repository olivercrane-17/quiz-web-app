import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MIN_SHEET_BODY_PX,
  focusIsElsewhere,
  keepSheetInView,
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

describe("R1-21 the explanation sheet on screen", () => {
  /** A sheet with a body, and the correct option and the pick above it. */
  function sheetWithBody() {
    const header = element("header", "header");
    header.style.position = "sticky";
    const correct = element("button", "correct");
    const pick = element("button", "pick");
    const sheet = element("section", "sheet");
    const body = element("div", "body", sheet);
    const action = element("button", "continue", sheet);
    const scrollIntoView = vi.fn();
    action.scrollIntoView = scrollIntoView;
    return { sheet, body, correct, pick, action, scrollIntoView };
  }

  /**
   * Lays the page out as `boxes` say, with the sheet as much shorter as its
   * body is held below `bodyHeight`, as a browser would.
   */
  function sheetLayout(
    boxes: Record<string, Box>,
    body: HTMLElement,
    bodyHeight: number,
  ) {
    const held = () =>
      body.style.maxHeight === ""
        ? 0
        : bodyHeight - Number.parseFloat(body.style.maxHeight);
    vi.spyOn(body, "clientHeight", "get").mockImplementation(
      () => bodyHeight - held(),
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const box = boxes[this.dataset.box ?? ""] ?? {
          top: 0,
          bottom: 0,
          height: 0,
        };
        const shift = this.dataset.box === "sheet" ? held() : 0;
        return {
          top: box.top,
          bottom: box.bottom - shift,
          height: box.height - shift,
        } as DOMRect;
      },
    );
  }

  it("moves nothing when the sheet fits below the options", () => {
    const { sheet, body } = sheetWithBody();
    layout({
      header: { top: 0, bottom: 56, height: 56 },
      sheet: { top: 500, bottom: 840, height: 340 },
    });
    keepSheetInView(sheet, { body });
    expect(scrollBy).not.toHaveBeenCalled();
    expect(body.style.maxHeight).toBe("");
  });

  it("scrolls the page just enough to show all of a sheet that runs off the bottom", () => {
    const { sheet, body } = sheetWithBody();
    layout({
      header: { top: 0, bottom: 56, height: 56 },
      sheet: { top: 560, bottom: 900, height: 340 },
    });
    keepSheetInView(sheet, { body });
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
    sheetLayout(
      {
        header: { top: 0, bottom: 56, height: 56 },
        sheet: { top: 600, bottom: 1500, height: 900 },
      },
      body,
      520,
    );
    keepSheetInView(sheet, { body });
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
    sheetLayout(
      {
        header: { top: 0, bottom: 56, height: 56 },
        sheet: { top: 600, bottom: 1600, height: 1000 },
      },
      body,
      150,
    );
    keepSheetInView(sheet, { body });
    expect(body.style.maxHeight).toBe(`${MIN_SHEET_BODY_PX}px`);
  });

  it("R1-21 at 360 by 640: the body scrolls inside the sheet before the page takes the correct option under the header", () => {
    vi.stubGlobal("innerHeight", 640);
    const { sheet, body, correct, pick } = sheetWithBody();
    // Question 1 of the review's run: the sheet needs 194 px of scroll,
    // and 139 px is all the correct option allows with the column's gap.
    sheetLayout(
      {
        header: { top: 0, bottom: 57, height: 57 },
        correct: { top: 212, bottom: 296, height: 84 },
        pick: { top: 308, bottom: 372, height: 64 },
        sheet: { top: 540, bottom: 834, height: 294 },
      },
      body,
      136,
    );
    keepSheetInView(sheet, { body, keep: [pick, correct] });
    expect(body.style.maxHeight).toBe(`${MIN_SHEET_BODY_PX}px`);
    expect(body.style.overflowY).toBe("auto");
    expect(body.tabIndex).toBe(0);
    // 194 - 40 px: the gap goes, the option stays, at 58 under a 57 px header.
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: 154,
      behavior: "instant",
    });
    expect(212 - 154).toBeGreaterThanOrEqual(57);
  });

  it("R1-21 keeps the column's gap under the header when the body can spare it", () => {
    vi.stubGlobal("innerHeight", 640);
    const { sheet, body, correct, pick } = sheetWithBody();
    sheetLayout(
      {
        header: { top: 0, bottom: 57, height: 57 },
        correct: { top: 212, bottom: 296, height: 84 },
        pick: { top: 308, bottom: 372, height: 64 },
        sheet: { top: 540, bottom: 834, height: 294 },
      },
      body,
      200,
    );
    keepSheetInView(sheet, { body, keep: [correct, pick] });
    // 194 needed, 139 allowed: the body gives up 55 px.
    expect(body.style.maxHeight).toBe("145px");
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: 139,
      behavior: "instant",
    });
  });

  it("R1-21 keeps the lower of the two options when the body can't keep both", () => {
    vi.stubGlobal("innerHeight", 640);
    const { sheet, body, correct, pick } = sheetWithBody();
    sheetLayout(
      {
        header: { top: 0, bottom: 57, height: 57 },
        correct: { top: 100, bottom: 164, height: 64 },
        pick: { top: 330, bottom: 394, height: 64 },
        sheet: { top: 410, bottom: 800, height: 390 },
      },
      body,
      200,
    );
    keepSheetInView(sheet, { body, keep: [correct, pick] });
    // Option A would need 117 px of the body's 104; option D needs none.
    expect(body.style.maxHeight).toBe("");
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: 160,
      behavior: "instant",
    });
  });

  it("R1-21 keeps only the title when no option can stay, and still shows Continue", () => {
    vi.stubGlobal("innerHeight", 640);
    const { sheet, body, pick } = sheetWithBody();
    sheetLayout(
      {
        header: { top: 0, bottom: 57, height: 57 },
        pick: { top: 100, bottom: 164, height: 64 },
        sheet: { top: 180, bottom: 900, height: 720 },
      },
      body,
      200,
    );
    keepSheetInView(sheet, { body, keep: [pick] });
    expect(body.style.maxHeight).toBe(`${MIN_SHEET_BODY_PX}px`);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: 900 - 104 - 640,
      behavior: "instant",
    });
  });

  it("measures the screen by the visual viewport, and brings Continue into it when the page can scroll no further", () => {
    // Pixel 7 at 200% text with a page wider than the screen: a 945 px
    // layout viewport over an 839 px screen.
    vi.stubGlobal("innerHeight", 945);
    vi.stubGlobal("visualViewport", { offsetTop: 0, height: 839 });
    const { sheet, body, action, scrollIntoView } = sheetWithBody();
    sheetLayout(
      {
        header: { top: 0, bottom: 113, height: 113 },
        sheet: { top: 500, bottom: 904, height: 404 },
        continue: { top: 792, bottom: 904, height: 112 },
      },
      body,
      150,
    );
    keepSheetInView(sheet, { body, action });
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
      top: 65,
      behavior: "instant",
    });
    // The page didn't move (it is at its end): the visual viewport has to.
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "nearest",
      behavior: "instant",
    });
  });

  it("leaves Continue alone when it is on screen", () => {
    const { sheet, body, action, scrollIntoView } = sheetWithBody();
    layout({
      header: { top: 0, bottom: 56, height: 56 },
      sheet: { top: 400, bottom: 800, height: 400 },
      continue: { top: 720, bottom: 776, height: 56 },
    });
    keepSheetInView(sheet, { body, action });
    expect(scrollBy).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing without layout", () => {
    const { sheet, body, action, scrollIntoView } = sheetWithBody();
    keepSheetInView(sheet, { body, action });
    keepSheetInView(null);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
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
