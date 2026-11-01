import { afterEach, describe, expect, it, vi } from "vitest";

import { EVENTS } from "@/analytics/dictionary";
import type { RunMode } from "@/engine/types";

import { analyticsMode, track, type TrackedEvent } from "./track";

/** Every run mode: a record, so a new mode fails to typecheck until listed. */
const RUN_MODES: Record<RunMode, true> = {
  daily: true,
  archive: true,
  challenge: true,
  pack: true,
  quiz: true,
  practice: true,
  blitz: true,
  survival: true,
  review: true,
  quiz_solo: true,
};
const RUN_MODES_FOR_TEST = Object.keys(RUN_MODES) as RunMode[];
const MODES: readonly string[] = EVENTS.results_view.mode.values;

function log(): TrackedEvent[] | undefined {
  return (window as unknown as { __qzTrackLog?: TrackedEvent[] }).__qzTrackLog;
}

afterEach(() => {
  delete (window as unknown as { __qzTrackLog?: unknown }).__qzTrackLog;
});

describe("track (stub)", () => {
  it("records calls in window.__qzTrackLog in mock builds", () => {
    track("first_answer", { mode: "practice" });
    track("share_open", { mode: "daily", surface: "stop" });
    expect(log()).toEqual([
      { name: "first_answer", props: { mode: "practice" } },
      { name: "share_open", props: { mode: "daily", surface: "stop" } },
    ]);
  });

  it("keeps a copy, so later changes to the caller's object don't rewrite history", () => {
    const props = { mode: "practice" as const };
    track("first_answer", props);
    (props as { mode: string }).mode = "daily";
    expect(log()?.[0]?.props).toEqual({ mode: "practice" });
  });

  it("refuses what the dictionary would drop, loudly", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    track("web_vitals", { metric: "LCP", value: -1, rating: "good" });
    expect(log()).toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("web_vitals would be dropped: invalid (value)"),
    );
  });

  it("is a no-op outside mock builds", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_MODE", "off");
    vi.resetModules();
    const { track: offTrack } = await import("./track");
    offTrack("first_answer", { mode: "practice" });
    expect(log()).toBeUndefined();
  });
});

describe("analyticsMode", () => {
  it("maps every run mode onto a dictionary mode", () => {
    for (const mode of RUN_MODES_FOR_TEST) {
      expect(MODES).toContain(analyticsMode(mode));
    }
    expect(analyticsMode("pack")).toBe("challenge");
    expect(analyticsMode("quiz_solo")).toBe("quiz");
    expect(analyticsMode("archive")).toBe("archive");
  });
});
