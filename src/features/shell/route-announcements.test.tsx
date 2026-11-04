import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LIVE_REGION_IDS, announce } from "@/ui/announce";

import { RouteAnnouncements } from "./route-announcements";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const polite = () => document.getElementById(LIVE_REGION_IDS.polite);

/** jsdom lays nothing out and has no checkVisibility: hidden ancestors hide in this stand-in. */
function installCheckVisibility(): void {
  Object.defineProperty(Element.prototype, "checkVisibility", {
    configurable: true,
    value(this: Element) {
      return this.closest("[hidden]") === null;
    },
  });
}

afterEach(() => {
  navigation.pathname = "/";
  delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
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

describe("RouteAnnouncements and focus", () => {
  /**
   * Today's route, with the footer link that had focus, now hidden as Next
   * hides a route it keeps, and the trust page's route shown after it.
   */
  function twoRoutes() {
    const today = document.createElement("div");
    today.innerHTML =
      '<main tabindex="-1">Today</main><footer><a href="/privacy">Privacy</a></footer>';
    const privacy = document.createElement("div");
    privacy.innerHTML =
      '<main tabindex="-1">Privacy</main><a href="/terms">Terms</a>';
    document.body.append(today, privacy);
    return {
      today,
      footerLink: today.querySelector("a") as HTMLAnchorElement,
      main: privacy.querySelector("main") as HTMLElement,
      link: privacy.querySelector("a") as HTMLAnchorElement,
    };
  }

  it("R1-09 hands focus left on the hidden page to the shown page's main", () => {
    installCheckVisibility();
    const { today, footerLink, main } = twoRoutes();
    const { rerender } = render(<RouteAnnouncements />);
    footerLink.focus();
    today.hidden = true;
    navigation.pathname = "/privacy";
    rerender(<RouteAnnouncements />);
    expect(main).toHaveFocus();
  });

  it("R1-09 hands focus that fell to the body to the shown page's main", () => {
    installCheckVisibility();
    const { today, main } = twoRoutes();
    today.hidden = true;
    const { rerender } = render(<RouteAnnouncements />);
    expect(document.body).toHaveFocus();
    navigation.pathname = "/privacy";
    rerender(<RouteAnnouncements />);
    expect(main).toHaveFocus();
  });

  it("R1-14 never moves focus that is still on something shown", () => {
    installCheckVisibility();
    const { today, link } = twoRoutes();
    const { rerender } = render(<RouteAnnouncements />);
    link.focus();
    today.hidden = true;
    navigation.pathname = "/privacy";
    rerender(<RouteAnnouncements />);
    expect(link).toHaveFocus();
  });

  it("moves nothing on the first render, or while the address stays", () => {
    installCheckVisibility();
    const { today, main } = twoRoutes();
    today.hidden = true;
    const { rerender } = render(<RouteAnnouncements />);
    expect(main).not.toHaveFocus();
    rerender(<RouteAnnouncements />);
    expect(main).not.toHaveFocus();
  });
});
