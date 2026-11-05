import { render } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INSET_VARIABLES, ScrollInset, type ScrollEdge } from "./scroll-inset";

/** A bar of a given height, as the layout would measure it (`data-height`). */
function Bar({
  edge,
  height,
  as: Element = "header",
}: {
  edge: ScrollEdge;
  height: number;
  as?: "header" | "nav";
}) {
  return (
    <Element data-height={height}>
      <ScrollInset edge={edge} />
    </Element>
  );
}

const inset = (edge: ScrollEdge) =>
  document.documentElement.style.getPropertyValue(INSET_VARIABLES[edge]);

beforeEach(() => {
  // jsdom lays nothing out: a bar measures the height its test gives it.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const height = Number(this.dataset.height ?? 0);
      return { height, width: 390, top: 0, left: 0 } as DOMRect;
    },
  );
  // jsdom has no ResizeObserver either.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

describe("ScrollInset", () => {
  it("R1-12 publishes the real heights of the bars on screen", () => {
    const { unmount } = render(
      <>
        <Bar edge="top" height={56} />
        <Bar edge="bottom" height={61} as="nav" />
      </>,
    );
    expect(inset("top")).toBe("56px");
    expect(inset("bottom")).toBe("61px");
    unmount();
    expect(inset("top")).toBe("0px");
    expect(inset("bottom")).toBe("0px");
  });

  it("R1-12 counts a taller bar, such as 200% text or a banner under it, rounded up", () => {
    render(<Bar edge="top" height={97.4} />);
    expect(inset("top")).toBe("98px");
  });

  it("R1-12 forgets the bars of a route Next hides, and counts them again when it shows", () => {
    const Tabs = ({ hidden }: { hidden: boolean }) => (
      <Activity mode={hidden ? "hidden" : "visible"}>
        <Bar edge="top" height={56} />
        <Bar edge="bottom" height={61} as="nav" />
      </Activity>
    );
    const Play = () => <Bar edge="top" height={84} />;

    // Today first; then the Daily opens and Next hides Today.
    const { rerender } = render(<Tabs hidden={false} />);
    expect([inset("top"), inset("bottom")]).toEqual(["56px", "61px"]);
    rerender(
      <>
        <Tabs hidden />
        <Play />
      </>,
    );
    expect([inset("top"), inset("bottom")]).toEqual(["84px", "0px"]);
    // Leave: the Daily goes and Today shows again.
    rerender(<Tabs hidden={false} />);
    expect([inset("top"), inset("bottom")]).toEqual(["56px", "61px"]);
  });

  it("is a hidden marker, never a box of its own", () => {
    const { container } = render(<Bar edge="top" height={56} />);
    const marker = container.querySelector("[data-scroll-inset]");
    expect(marker).toHaveAttribute("hidden");
    expect(marker).toBeEmptyDOMElement();
  });
});
