import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getSettingsStore } from "@/platform/settings/store";
import { LIVE_REGION_IDS, clearAnnouncements } from "@/ui/announce";

import PlayLayout from "./routes/play-layout";

const polite = () => document.getElementById(LIVE_REGION_IDS.polite);

afterEach(() => {
  act(() => {
    getSettingsStore().update({ stopwatch: "shown" });
  });
  clearAnnouncements();
});

function playScreen() {
  return (
    <PlayLayout>
      <main>A play screen</main>
    </PlayLayout>
  );
}

describe("StopwatchChoice", () => {
  it("R3-09 says 'Stopwatch hidden. It still runs for tie-breaks.' when Hide stopwatch hides it", () => {
    render(playScreen());
    act(() => {
      getSettingsStore().update({ stopwatch: "hidden" });
    });
    expect(polite()).toHaveTextContent(
      "Stopwatch hidden. It still runs for tie-breaks.",
    );
  });

  it("R3-09 says nothing when the stopwatch comes back, or for a Daily opened with it hidden", () => {
    act(() => {
      getSettingsStore().update({ stopwatch: "hidden" });
    });
    // A Daily that opens with it already hidden says nothing either.
    render(playScreen());
    expect(polite()?.textContent ?? "").toBe("");
    act(() => {
      getSettingsStore().update({ stopwatch: "shown" });
    });
    expect(polite()?.textContent ?? "").toBe("");
  });
});
