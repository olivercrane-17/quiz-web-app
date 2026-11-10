import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_REGION_IDS, clearRouteAnnouncements } from "./announce";
import { signalRouteChange } from "./route-change";
import { choosePlace, showToast } from "./toast";

const toasts = () => [
  ...document.querySelectorAll<HTMLElement>("[data-toast]"),
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
  delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
});

describe("showToast", () => {
  it("shows the message and says it through the status region", () => {
    showToast("Copied. Paste it into your group chat.");
    const [toast] = toasts();
    expect(toast).toHaveTextContent("Copied. Paste it into your group chat.");
    // Screen readers hear the status region; the pill would repeat it.
    expect(toast).toHaveAttribute("aria-hidden", "true");
    expect(document.getElementById(LIVE_REGION_IDS.polite)).toHaveTextContent(
      "Copied. Paste it into your group chat.",
    );
  });

  it("R1-09 keeps its words through a change of address, and takes them back as it leaves", () => {
    const region = () => document.getElementById(LIVE_REGION_IDS.polite);
    // "Saved" on Leave: the shell clears the old page's messages on arrival.
    showToast("Saved");
    clearRouteAnnouncements();
    expect(region()).toHaveTextContent("Saved");
    vi.advanceTimersByTime(4_000);
    expect(region()).toBeEmptyDOMElement();
  });

  it("shows one at a time", () => {
    showToast("Saved");
    showToast("Report sent");
    vi.advanceTimersByTime(250);
    expect(toasts().map((toast) => toast.textContent)).toEqual(["Report sent"]);
  });

  it("leaves after 4 s", () => {
    showToast("Saved");
    vi.advanceTimersByTime(3_999);
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts()[0]).toHaveAttribute("data-leaving");
    vi.advanceTimersByTime(250);
    expect(toasts()).toHaveLength(0);
  });

  it("with an action, has no time limit and says the action is there (WCAG 2.2.1)", () => {
    showToast("Quiz deleted", {
      action: { label: "Undo", onAction: () => {} },
    });
    expect(document.getElementById(LIVE_REGION_IDS.polite)).toHaveTextContent(
      "Quiz deleted. Undo is available.",
    );
    vi.advanceTimersByTime(60_000);
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).not.toHaveAttribute("data-leaving");

    // Escape dismisses it, as does the next toast.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(toasts()[0]).toHaveAttribute("data-leaving");
    vi.advanceTimersByTime(250);
    showToast("Quiz deleted.", {
      action: { label: "Undo", onAction: () => {} },
    });
    expect(document.getElementById(LIVE_REGION_IDS.polite)).toHaveTextContent(
      "Quiz deleted. Undo is available.",
    );
    showToast("Saved");
    vi.advanceTimersByTime(250);
    expect(toasts().map((toast) => toast.textContent)).toEqual(["Saved"]);
  });

  it("shows a check by default, the offline icon for something queued, or none", () => {
    showToast("Saved");
    expect(toasts()[0]?.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "check",
    );
    showToast("We'll send this when you're back online.", { icon: "offline" });
    expect(toasts().at(-1)?.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "offline",
    );
    showToast("Copied", { icon: "none" });
    expect(toasts().at(-1)?.querySelector("svg")).toBeNull();
  });

  it("goes on a tap, and its action runs once", () => {
    const onAction = vi.fn();
    showToast("Quiz deleted", { action: { label: "Undo", onAction } });
    const [toast] = toasts();
    // An action must be reachable, so this one is not hidden.
    expect(toast).not.toHaveAttribute("aria-hidden");
    toast?.querySelector("button")?.click();
    expect(onAction).toHaveBeenCalledOnce();
    expect(toast).toHaveAttribute("data-leaving");

    showToast("Saved");
    const [, saved] = toasts();
    saved?.click();
    expect(saved).toHaveAttribute("data-leaving");
  });

  it("rises 16 px above the tab bar or dock on screen", () => {
    Object.defineProperty(Element.prototype, "checkVisibility", {
      configurable: true,
      value: () => true,
    });
    const bar = document.createElement("nav");
    bar.dataset.toastAnchor = "";
    bar.getBoundingClientRect = () =>
      ({ top: window.innerHeight - 64 }) as DOMRect;
    document.body.append(bar);
    showToast("Saved");
    expect(toasts()[0]?.style.getPropertyValue("--kn-toast-bottom")).toBe(
      "80px",
    );
  });

  it("rises above the next page's bar once the address changes, not the dock it was shown over", () => {
    Object.defineProperty(Element.prototype, "checkVisibility", {
      configurable: true,
      value: () => true,
    });
    // The stop screen's dock, 120 px tall.
    const dock = document.createElement("div");
    dock.dataset.toastAnchor = "";
    dock.getBoundingClientRect = () =>
      ({ top: window.innerHeight - 120 }) as DOMRect;
    document.body.append(dock);
    showToast("Copied. Paste it into your group chat.");
    const [toast] = toasts();
    expect(toast?.style.getPropertyValue("--kn-toast-bottom")).toBe("136px");

    // "Done for today": a page with no bar at all.
    dock.remove();
    signalRouteChange();
    expect(toast?.style.getPropertyValue("--kn-toast-bottom")).toBe(
      "calc(16px + env(safe-area-inset-bottom))",
    );

    // Once it has gone, a later change of address leaves it alone.
    vi.advanceTimersByTime(4_000);
    document.body.append(dock);
    signalRouteChange();
    expect(toast?.style.getPropertyValue("--kn-toast-bottom")).toBe(
      "calc(16px + env(safe-area-inset-bottom))",
    );
  });

  it("R3-08 moves under the header when a control is under its place above the bar, and back once the bottom is clear", () => {
    Object.defineProperty(Element.prototype, "checkVisibility", {
      configurable: true,
      value: () => true,
    });
    const height = window.innerHeight;
    const width = window.innerWidth;
    // Today at 200% text: Continue at the bottom of the screen, where a
    // toast with no bar to rise above would sit.
    const toastBox = function (this: HTMLElement) {
      const top = this.dataset.place === "top" ? 72 : height - 16 - 40;
      return {
        top,
        bottom: top + 40,
        left: width / 2 - 150,
        right: width / 2 + 150,
        width: 300,
        height: 40,
      } as DOMRect;
    };
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.dataset.toast !== undefined) return toastBox.call(this);
      if (this.dataset.continue !== undefined) {
        return {
          top: height - 70,
          bottom: height - 22,
          left: 16,
          right: width - 16,
          width: width - 32,
          height: 48,
        } as DOMRect;
      }
      return original.call(this);
    };
    try {
      const button = document.createElement("button");
      button.dataset.continue = "";
      button.textContent = "Continue";
      document.body.append(button);
      showToast("Saved. The stopwatch keeps running.");
      const [toast] = toasts();
      expect(toast).toHaveAttribute("data-place", "top");
      expect(toast?.style.getPropertyValue("--kn-toast-top")).toBe("72px");

      // Continue leaves the screen: the toast stays where it is, since the
      // top is clear too.
      button.remove();
      signalRouteChange();
      expect(toast).toHaveAttribute("data-place", "top");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  it("R3-08 chooses the place with no control under it, and stays put when both or neither have one", () => {
    const viewport = { width: 390, height: 844 };
    const size = { width: 300, height: 40 };
    const spots = { bottom: 80, top: 72 };
    const share = { left: 16, right: 374, top: 700, bottom: 748 };
    const heading = { left: 16, right: 374, top: 80, bottom: 120 };
    expect(choosePlace("bottom", size, spots, [], viewport).place).toBe(
      "bottom",
    );
    expect(choosePlace("bottom", size, spots, [share], viewport).place).toBe(
      "top",
    );
    expect(choosePlace("top", size, spots, [heading], viewport).place).toBe(
      "bottom",
    );
    expect(
      choosePlace("bottom", size, spots, [share, heading], viewport).place,
    ).toBe("bottom");
    expect(choosePlace("top", size, spots, [share], viewport).place).toBe(
      "top",
    );
    // A control beside the centred pill, not under it, doesn't count.
    const corner = { left: 0, right: 40, top: 730, bottom: 760 };
    expect(choosePlace("bottom", size, spots, [corner], viewport).place).toBe(
      "bottom",
    );
  });

  it("R3-08 with a control under both places, sinks toward the bar, no closer than 4 px, until it clears", () => {
    // 320 x 568 at 200% text: the pill is 141 px tall, Share sits at
    // 204-263 and the dock's top at 419, so the pill's usual place is
    // 262-403, a pixel onto Share.
    const viewport = { width: 320, height: 568 };
    const size = { width: 288, height: 141 };
    const spots = { bottom: 568 - 419 + 16, top: 72 };
    const share = { left: 16, right: 304, top: 204, bottom: 263 };
    const sink = { anchorTop: 419, gap: 16, minGap: 4 };
    expect(choosePlace("bottom", size, spots, [share], viewport)).toEqual({
      place: "bottom",
      bottom: spots.bottom,
    });
    // 15 px above the dock is the first gap that clears Share: 263-404.
    expect(choosePlace("bottom", size, spots, [share], viewport, sink)).toEqual(
      { place: "bottom", bottom: 568 - 419 + 15 },
    );
    // A control it cannot clear even 4 px above the bar: it stays put.
    const tall = { left: 16, right: 304, top: 204, bottom: 300 };
    expect(choosePlace("top", size, spots, [tall], viewport, sink)).toEqual({
      place: "top",
      bottom: spots.bottom,
    });
  });

  it("ignores empty text and returns a dismiss function", () => {
    showToast("   ");
    expect(toasts()).toHaveLength(0);
    const dismiss = showToast("Saved");
    dismiss();
    expect(toasts()[0]).toHaveAttribute("data-leaving");
  });
});
