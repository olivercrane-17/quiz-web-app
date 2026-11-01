import { describe, expect, it, vi } from "vitest";

import { HAPTICS, isHapticsSupported, vibrate } from "./haptics";
import { playEffect } from "./sound";

describe("sound and haptics stubs", () => {
  it("play nothing and never throw", () => {
    const vibrateSpy = vi.fn();
    vi.stubGlobal("navigator", { vibrate: vibrateSpy });
    expect(() => {
      playEffect("mystery_solved", { points: 3 });
      vibrate(HAPTICS.wrong);
    }).not.toThrow();
    expect(vibrateSpy).not.toHaveBeenCalled();
  });

  it("detect the vibration API", () => {
    vi.stubGlobal("navigator", { vibrate: vi.fn() });
    expect(isHapticsSupported()).toBe(true);
    vi.stubGlobal("navigator", {});
    expect(isHapticsSupported()).toBe(false);
  });
});
