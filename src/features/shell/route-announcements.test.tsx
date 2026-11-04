import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LIVE_REGION_IDS, announce } from "@/ui/announce";

import { RouteAnnouncements } from "./route-announcements";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const polite = () => document.getElementById(LIVE_REGION_IDS.polite);

afterEach(() => {
  navigation.pathname = "/";
  document.body.replaceChildren();
});

describe("RouteAnnouncements", () => {
  it("R1-09 clears the status region when the address changes, never on the first render", () => {
    announce("Welcome back.");
    const { rerender } = render(<RouteAnnouncements />);
    expect(polite()).toHaveTextContent("Welcome back.");

    announce("Clue 2 is in. Now worth 3.");
    navigation.pathname = "/daily";
    rerender(<RouteAnnouncements />);
    // Arriving on the Daily leaves nothing of Today's.
    expect(polite()).toBeEmptyDOMElement();

    announce("247% off. You said 300 m.");
    navigation.pathname = "/";
    rerender(<RouteAnnouncements />);
    expect(polite()).toBeEmptyDOMElement();
  });

  it("keeps the messages of the page it stays on", () => {
    const { rerender } = render(<RouteAnnouncements />);
    announce("4 people match");
    rerender(<RouteAnnouncements />);
    expect(polite()).toHaveTextContent("4 people match");
  });
});
