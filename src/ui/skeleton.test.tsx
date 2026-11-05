import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithUser } from "@/test/render";

import { Card } from "./card";
import { Loading, Skeleton, SkeletonText } from "./skeleton";

describe("Loading and Skeleton", () => {
  it("marks the region busy with a label and hides the shapes", () => {
    const { container } = renderWithUser(
      <Loading label="Loading today's Daily">
        <Skeleton shape="block" height="12rem" />
        <SkeletonText lines={2} />
      </Loading>,
    );
    const region = container.querySelector("[data-loading]");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading today's Daily")).toHaveClass("sr-only");
    // Every shape is decorative.
    for (const shape of container.querySelectorAll("[data-skeleton]")) {
      expect(shape.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(container.querySelectorAll("[data-skeleton]")).toHaveLength(3);
  });

  it("waits out the 300 ms grace unless immediate", () => {
    const { container, rerender } = renderWithUser(
      <Loading>
        <Skeleton />
      </Loading>,
    );
    const shapes = () =>
      container.querySelector('[data-loading] > [aria-hidden="true"]');
    // The 300 ms grace is a CSS transition from @starting-style (ui.css).
    expect(shapes()).toHaveClass("kn-loading-shapes");
    rerender(
      <Loading immediate>
        <Skeleton />
      </Loading>,
    );
    expect(shapes()).not.toHaveClass("kn-loading-shapes");
  });

  it("sizes a shape from its props", () => {
    const { container } = renderWithUser(
      <Skeleton shape="circle" width="3rem" height="3rem" />,
    );
    const shape = container.querySelector<HTMLElement>("[data-skeleton]");
    expect(shape).toHaveAttribute("data-skeleton", "circle");
    expect(shape?.style.width).toBe("3rem");
  });
});

describe("Card", () => {
  it("renders the element and tone it is given", () => {
    renderWithUser(
      <Card as="section" tone="ticket" aria-label="Today's Daily">
        Three Mysteries and an Encore
      </Card>,
    );
    const card = screen.getByRole("region", { name: "Today's Daily" });
    expect(card.tagName).toBe("SECTION");
    expect(card).toHaveAttribute("data-tone", "ticket");
  });
});
