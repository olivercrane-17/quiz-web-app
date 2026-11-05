import { afterEach, describe, expect, it } from "vitest";

import { renderWithUser } from "@/test/render";

import { LIVE_REGION_IDS } from "./announce";
import { LiveRegions } from "./live-regions";

afterEach(() => {
  document.body.replaceChildren();
});

describe("LiveRegions", () => {
  it("makes one app-wide pair however many layouts render it", () => {
    const { container } = renderWithUser(
      <>
        <LiveRegions />
        <LiveRegions />
      </>,
    );
    // Nothing renders in place: the regions live outside every route.
    expect(container).toBeEmptyDOMElement();
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    const polite = document.getElementById(LIVE_REGION_IDS.polite);
    expect(polite).toHaveAttribute("aria-live", "polite");
    expect(polite?.parentElement).toBe(document.body);
  });
});
