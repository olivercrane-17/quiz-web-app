/**
 * The Daily's "Saved" toast on Leave (DESIGN §6.9, RITE round 1 R1-38).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_REGION_IDS } from "@/ui/announce";

import {
  TOAST_MS,
  TOAST_WAIT_MS,
  showToast,
  showToastAfterLeaving,
} from "./toast";

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
  for (const toast of toasts()) toast.remove();
  document.getElementById(LIVE_REGION_IDS.polite)?.remove();
  document.querySelector("nav[data-placement]")?.remove();
  vi.useRealTimers();
});

describe("the Daily's toast", () => {
  it("R1-38 shows 'Saved' once Leave has taken the player off the Daily, and says it in the status region", () => {
    showToastAfterLeaving("Saved", "/daily");
    runFrames(5);
    // Still on the Daily: the next screen isn't there to sit on yet.
    expect(toasts()).toEqual([]);

    window.history.pushState(null, "", "/");
    runFrames(2);
    const [toast] = toasts();
    expect(toast).toHaveTextContent("Saved");
    expect(toast).toHaveAttribute("aria-hidden", "true");
    expect(status()).toBe("Saved");
  });

  it("R1-38 sits 16 px above Today's bottom tab bar", () => {
    const nav = document.createElement("nav");
    nav.dataset.placement = "bottom";
    nav.getBoundingClientRect = () => ({ top: 700 }) as DOMRect;
    nav.checkVisibility = () => true;
    document.body.append(nav);
    vi.stubGlobal("innerHeight", 760);
    showToast("Saved");
    expect(toasts()[0]?.style.bottom).toBe("76px");
  });

  it("shows anyway if the address never changes, after a short wait", () => {
    showToastAfterLeaving("Saved", "/daily");
    runFrames(Math.ceil(TOAST_WAIT_MS / 16) + 2);
    expect(toasts()).toHaveLength(1);
  });

  it("keeps one toast at a time, leaves after 4 s, and goes on a tap", () => {
    vi.useFakeTimers();
    showToast("First");
    showToast("Saved");
    expect(toasts().map((toast) => toast.textContent)).toEqual(["Saved"]);
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts()).toEqual([]);

    showToast("Saved");
    toasts()[0]?.click();
    expect(toasts()).toEqual([]);
    expect(showToast("   ")).toBeTypeOf("function");
    expect(toasts()).toEqual([]);
  });
});
