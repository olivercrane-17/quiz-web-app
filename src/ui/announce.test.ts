import { afterEach, describe, expect, it } from "vitest";

import {
  LIVE_REGION_IDS,
  announce,
  clearAnnouncements,
  ensureLiveRegions,
} from "./announce";

afterEach(() => {
  document.body.replaceChildren();
});

function regionOf(id: string): HTMLElement {
  const region = document.getElementById(id);
  if (region === null) throw new Error(`no region ${id}`);
  return region;
}

describe("announce", () => {
  it("writes polite messages into the status region", () => {
    announce("Correct. Paris.");
    const region = regionOf(LIVE_REGION_IDS.polite);
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Correct. Paris.");
  });

  it("uses the alert region only when asked", () => {
    announce("You're offline. Your progress is saved.", "assertive");
    const alert = regionOf(LIVE_REGION_IDS.assertive);
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent("You're offline.");
    expect(document.getElementById(LIVE_REGION_IDS.polite)).toBeNull();
  });

  it("re-announces the same text with a new node", () => {
    announce("Not quite.");
    const first = regionOf(LIVE_REGION_IDS.polite).firstChild;
    announce("Not quite.");
    const second = regionOf(LIVE_REGION_IDS.polite).firstChild;
    expect(second).not.toBe(first);
    expect(regionOf(LIVE_REGION_IDS.polite).childNodes).toHaveLength(1);
  });

  it("reuses regions the page already rendered", () => {
    const existing = document.createElement("div");
    existing.id = LIVE_REGION_IDS.polite;
    document.body.append(existing);
    announce("4 people match");
    expect(
      document.querySelectorAll(`#${LIVE_REGION_IDS.polite}`),
    ).toHaveLength(1);
    expect(existing).toHaveTextContent("4 people match");
  });

  it("ignores empty messages and clears on request", () => {
    announce("   ");
    expect(document.getElementById(LIVE_REGION_IDS.polite)).toBeNull();
    announce("Saved");
    clearAnnouncements();
    expect(regionOf(LIVE_REGION_IDS.polite)).toBeEmptyDOMElement();
  });
});

describe("ensureLiveRegions", () => {
  it("creates one pair at the end of the body, once", () => {
    ensureLiveRegions();
    ensureLiveRegions();
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(document.body.lastElementChild).toHaveAttribute(
      "id",
      LIVE_REGION_IDS.assertive,
    );
  });
});
