/**
 * The Daily's "Saved" toast on Leave (DESIGN §6.9, RITE round 1 R1-38),
 * which is the design system's toast (`@/ui/toast`) since FIX-DS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_REGION_IDS } from "@/ui/announce";
import { TOAST_ANCHOR } from "@/ui/toast";

import { TOAST_WAIT_MS, showToastAfterLeaving } from "./leave-toast";

/** Animation frames the test runs by hand. */
let frames: FrameRequestCallback[] = [];

function runFrames(count: number): void {
  for (let i = 0; i < count; i += 1) {
    const due = frames;
    frames = [];
    for (const frame of due) frame(0);
  }
}

const toasts = () => [
  ...document.querySelectorAll<HTMLElement>("[data-toast]"),
];
const status = () =>
  document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
    frames.push(frame);
    return frames.length;
  });
  window.history.replaceState(null, "", "/daily");
});

afterEach(() => {
  document.body.replaceChildren();
  delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
});

describe("the Daily's toast on Leave", () => {
  it("R1-38 shows 'Saved' as the design system's toast once Leave has taken the player off the Daily, and says it in the status region", () => {
    showToastAfterLeaving("Saved", "/daily");
    runFrames(5);
    // Still on the Daily: the next screen isn't there to sit on yet.
    expect(toasts()).toEqual([]);

    window.history.pushState(null, "", "/");
    runFrames(2);
    const [toast] = toasts();
    expect(toast).toHaveTextContent("Saved");
    expect(toast).toHaveClass("kn-toast");
    expect(toast).toHaveAttribute("aria-hidden", "true");
    expect(status()).toBe("Saved");
  });

  it("R1-38 sits 16 px above the tab bar of the screen it lands on", () => {
    showToastAfterLeaving("Saved", "/daily");
    window.history.pushState(null, "", "/");
    // Today's bottom tab bar, the toast's anchor, arrives with the route.
    const nav = document.createElement("nav");
    nav.setAttribute(TOAST_ANCHOR.slice(1, -1), "");
    nav.getBoundingClientRect = () => ({ top: 700 }) as DOMRect;
    (Element.prototype as { checkVisibility?: () => boolean }).checkVisibility =
      () => true;
    document.body.append(nav);
    vi.stubGlobal("innerHeight", 760);
    runFrames(2);
    expect(toasts()[0]?.style.getPropertyValue("--kn-toast-bottom")).toBe(
      "76px",
    );
  });

  it("shows anyway if the address never changes, after a short wait", () => {
    showToastAfterLeaving("Saved", "/daily");
    runFrames(Math.ceil(TOAST_WAIT_MS / 16) + 2);
    expect(toasts()).toHaveLength(1);
  });
});
