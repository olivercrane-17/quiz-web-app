import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_REGION_IDS } from "./announce";
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

  it("shows one at a time", () => {
    showToast("Saved");
    showToast("Report sent");
    vi.advanceTimersByTime(250);
    expect(toasts().map((toast) => toast.textContent)).toEqual(["Report sent"]);
  });

  it("leaves after 4 s, or 10 s with an action", () => {
    showToast("Saved");
    vi.advanceTimersByTime(3_999);
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts()[0]).toHaveAttribute("data-leaving");
    vi.advanceTimersByTime(250);
    expect(toasts()).toHaveLength(0);

    showToast("Quiz deleted", {
      action: { label: "Undo", onAction: () => {} },
    });
    vi.advanceTimersByTime(9_999);
    expect(toasts()[0]).not.toHaveAttribute("data-leaving");
    vi.advanceTimersByTime(1);
    expect(toasts()[0]).toHaveAttribute("data-leaving");
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

  it("ignores empty text and returns a dismiss function", () => {
    showToast("   ");
    expect(toasts()).toHaveLength(0);
    const dismiss = showToast("Saved");
    dismiss();
    expect(toasts()[0]).toHaveAttribute("data-leaving");
  });
});
