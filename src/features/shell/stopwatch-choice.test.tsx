import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getSettingsStore } from "@/platform/settings/store";
import { LIVE_REGION_IDS, clearAnnouncements } from "@/ui/announce";

import { PlayHeader } from "./play-header";

const polite = () => document.getElementById(LIVE_REGION_IDS.polite);

afterEach(() => {
  act(() => {
    getSettingsStore().update({ stopwatch: "shown" });
  });
  clearAnnouncements();
});

function header(end?: boolean) {
  return (
    <PlayHeader
      leave={{ href: "/", label: "Leave the Daily" }}
      end={end === true ? <button type="button">More</button> : undefined}
    />
  );
}

describe("StopwatchChoice", () => {
  it("R3-09 says 'Stopwatch hidden. Show it again from More.' when Hide stopwatch hides it", () => {
    render(header(true));
    act(() => {
      getSettingsStore().update({ stopwatch: "hidden" });
    });
    expect(polite()).toHaveTextContent(
      "Stopwatch hidden. Show it again from More.",
    );
  });

  it("R3-09 says nothing when the stopwatch comes back, or for a header with no end slot", () => {
    act(() => {
      getSettingsStore().update({ stopwatch: "hidden" });
    });
    // A Daily that opens with it already hidden says nothing either.
    const { unmount } = render(header(true));
    act(() => {
      getSettingsStore().update({ stopwatch: "shown" });
    });
    expect(polite()?.textContent ?? "").toBe("");
    unmount();

    render(header(false));
    act(() => {
      getSettingsStore().update({ stopwatch: "hidden" });
    });
    expect(polite()?.textContent ?? "").toBe("");
  });
});
