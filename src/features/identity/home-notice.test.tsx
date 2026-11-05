/**
 * Today's restore note (DESIGN §12.1): shown once after a sync code or a
 * claim, by the cached profile's name, never for another player, and never
 * after the backup cookie's silent restore. Leaving Today ends it: coming
 * back neither shows nor says it again.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { cacheProfile } from "@/platform/identity/profile";
import { LIVE_REGION_IDS, clearAnnouncements } from "@/ui/announce";

import { bootDevice, resetDevice, storedIdentity } from "./__fixtures__/device";
import { RestoreNotice } from "./home-notice";
import { RestoreNoticeCard } from "./home-notice-card";
import { RESTORE_NOTICE_KEY } from "./notice-flag";
import { leaveRestoreNotice } from "./restore-notice";

afterEach(() => {
  resetDevice();
});

const CLAIMED = "You're all set. Your streak is safe in this browser.";

/** What the polite status region says now. */
function said(): string {
  return document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";
}

function device() {
  const identity = storedIdentity();
  if (identity === null) throw new Error("no identity");
  return identity;
}

describe("RestoreNotice", () => {
  it("renders nothing without a note, so its slot stays empty", async () => {
    await bootDevice();
    const { container } = render(<RestoreNotice />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("welcomes the player back by name with the streak a sync code brought", async () => {
    await bootDevice({ registered: true });
    const { playerId } = device();
    cacheProfile({
      playerId,
      friendlyName: "Plucky Otter",
      nickname: null,
      ageBand: null,
      createdAt: Date.now(),
    });
    leaveRestoreNotice({ v: 1, kind: "sync", playerId, streak: 23 });
    render(<RestoreNoticeCard />);
    expect(
      await screen.findByText(
        "Welcome back, Plucky Otter. Your 23-day streak is here.",
        { selector: "[data-restore-notice] p" },
      ),
    ).toBeVisible();
    // Shown once: the note left session storage.
    expect(sessionStorage.getItem(RESTORE_NOTICE_KEY)).toBeNull();
  });

  it("uses the nickname, and the Daily history when there is no streak", async () => {
    await bootDevice({ registered: true });
    const { playerId } = device();
    cacheProfile({
      playerId,
      friendlyName: "Plucky Otter",
      nickname: "Priya",
      ageBand: "18_plus",
      createdAt: Date.now(),
    });
    leaveRestoreNotice({ v: 1, kind: "sync", playerId, streak: 0 });
    render(<RestoreNoticeCard />);
    expect(
      await screen.findByText(
        "Welcome back, Priya. Your Daily history is here.",
        {
          selector: "[data-restore-notice] p",
        },
      ),
    ).toBeVisible();
  });

  it("says the streak is safe in this browser after a claim", async () => {
    await bootDevice({ registered: true });
    leaveRestoreNotice({
      v: 1,
      kind: "claim",
      playerId: device().playerId,
      streak: 1,
    });
    render(<RestoreNotice />);
    expect(
      await screen.findByText(
        "You're all set. Your streak is safe in this browser.",
        { selector: "[data-restore-notice] p" },
      ),
    ).toBeVisible();
  });

  it("shows and says the note once: leaving Today and coming back brings neither back", async () => {
    await bootDevice({ registered: true });
    leaveRestoreNotice({
      v: 1,
      kind: "claim",
      playerId: device().playerId,
      streak: 1,
    });
    // Next keeps Today mounted but hidden while the player is elsewhere.
    const today = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <RestoreNoticeCard />
      </Activity>
    );
    const { rerender, container } = render(today("visible"));
    expect(
      await screen.findByText(CLAIMED, { selector: "[data-restore-notice] p" }),
    ).toBeVisible();
    expect(said()).toBe(CLAIMED);
    // The player goes to Practice (the shell clears the regions on the way)...
    clearAnnouncements();
    rerender(today("hidden"));
    // ...and back to Today, twice.
    rerender(today("visible"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    rerender(today("hidden"));
    rerender(today("visible"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector("[data-restore-notice]")).toBeNull();
    expect(said()).toBe("");
  });

  it("says nothing more when Today mounts again in the same page load", async () => {
    await bootDevice({ registered: true });
    leaveRestoreNotice({
      v: 1,
      kind: "claim",
      playerId: device().playerId,
      streak: 1,
    });
    const first = render(<RestoreNotice />);
    expect(
      await screen.findByText(CLAIMED, { selector: "[data-restore-notice] p" }),
    ).toBeVisible();
    first.unmount();
    clearAnnouncements();
    const { container } = render(<RestoreNotice />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector("[data-restore-notice]")).toBeNull();
    expect(said()).toBe("");
  });

  it("shows nothing for a note about another player", async () => {
    await bootDevice({ registered: true });
    leaveRestoreNotice({
      v: 1,
      kind: "claim",
      playerId: "0f8fad5b-d9cb-469f-a165-70867728950e" as never,
      streak: 1,
    });
    const { container } = render(<RestoreNoticeCard />);
    await waitFor(() => {
      expect(sessionStorage.getItem(RESTORE_NOTICE_KEY)).toBeNull();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
