import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_REGION_IDS, clearRouteAnnouncements } from "./announce";
import { signalRouteChange } from "./route-change";
import { showToast } from "./toast";

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

  it("ignores empty text and returns a dismiss function", () => {
    showToast("   ");
    expect(toasts()).toHaveLength(0);
    const dismiss = showToast("Saved");
    dismiss();
    expect(toasts()[0]).toHaveAttribute("data-leaving");
  });
});
