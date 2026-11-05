import { render } from "@testing-library/react";
import { Activity } from "react";
import { describe, expect, it } from "vitest";

import { MAIN_ID } from "./landmarks";
import { MainLandmark } from "./main-landmark";

/**
 * Routes the way Next keeps them: each mounts on screen when it is first
 * visited, and an earlier one stays in the document, hidden in an Activity.
 */
function Routes({
  visited,
  shown,
}: {
  visited: readonly string[];
  shown: string;
}) {
  return (
    <>
      {visited.map((route) => (
        <Activity key={route} mode={route === shown ? "visible" : "hidden"}>
          <MainLandmark className={route}>{route}</MainLandmark>
        </Activity>
      ))}
    </>
  );
}

const withId = () =>
  [...document.querySelectorAll(`#${MAIN_ID}`)].map((main) => main.className);

describe("MainLandmark", () => {
  it("R1-09 gives #main to the route on screen only, as Next hides and shows routes", () => {
    const { container, rerender } = render(
      <Routes visited={["today"]} shown="today" />,
    );
    expect(withId()).toEqual(["today"]);

    // Today, then the Daily, then a practice run: three mains in the document.
    rerender(<Routes visited={["today", "daily"]} shown="daily" />);
    expect(withId()).toEqual(["daily"]);
    rerender(
      <Routes visited={["today", "daily", "practice"]} shown="practice" />,
    );
    expect(container.querySelectorAll("main")).toHaveLength(3);
    expect(withId()).toEqual(["practice"]);

    // Back to Today: it takes the id again.
    rerender(<Routes visited={["today", "daily", "practice"]} shown="today" />);
    expect(withId()).toEqual(["today"]);
  });

  it("is in the prerendered markup, so the skip link works before hydration", () => {
    const { container } = render(<MainLandmark>Today</MainLandmark>);
    const main = container.querySelector("main");
    expect(main).toHaveAttribute("id", MAIN_ID);
    expect(main).toHaveAttribute("tabindex", "-1");
  });
});
