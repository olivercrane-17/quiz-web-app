/**
 * The stop screen's sync offer (PRD §3.10.2, §3.10.5): its copy, Show my
 * code opening the code in the card, accepted once the code is saved. A
 * restored profile, which may have a code written down elsewhere, never
 * loses it to the offer's first tap; focus follows the card as it opens.
 */
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import {
  BROWSER,
  bootDevice,
  offerContext,
  resetDevice,
  storedIdentity,
  trackLog,
} from "../__fixtures__/device";
import { WHAT_MOVES } from "../client-copy";
import { readSyncRecord } from "../sync-store";
import { SyncCard } from "./sync-card";

/** Re-stamps the stored identity's source, as a claim or the cookie would have left it. */
function restoredBy(source: "claim" | "cookie" | "sync"): void {
  const identity = storedIdentity();
  if (identity === null) throw new Error("no identity");
  localStorage.setItem("qz:identity", JSON.stringify({ ...identity, source }));
}

afterEach(() => {
  resetDevice();
});

function renderCard(ctx = offerContext({ earlierFinishes: 2 })) {
  const onAccept = vi.fn();
  const onDismiss = vi.fn();
  return {
    ...renderWithUser(
      <SyncCard ctx={ctx} onAccept={onAccept} onDismiss={onDismiss} />,
    ),
    onAccept,
    onDismiss,
  };
}

describe("the sync offer card", () => {
  it("AC-SYN-07 the sync-code offer says what comes with the player and what stays", async () => {
    await bootDevice({ registered: true });
    renderCard();
    expect(
      screen.getByRole("heading", { name: "Keep your streak safe" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Save your sync code to restore your progress on another device or if your browser clears its data.",
      ),
    ).toBeVisible();
    expect(screen.getByText(WHAT_MOVES)).toBeVisible();
    // Its action is secondary, never primary (AC-DLY-14).
    expect(
      screen.getByRole("button", { name: "Show my code" }),
    ).toHaveAttribute("data-variant", "secondary");
    expect(trackLog()).toContainEqual({
      name: "sync_code_offer",
      props: { trigger: "third_daily" },
    });
  });

  it("opens the code in the card, and reports accepted once it is saved", async () => {
    await bootDevice({ registered: true });
    const { user, onAccept } = renderCard();
    await user.click(screen.getByRole("button", { name: "Show my code" }));
    expect(onAccept).not.toHaveBeenCalled();
    const copy = await screen.findByRole("button", { name: "Copy code" });
    await user.click(copy);
    await user.click(screen.getByRole("button", { name: "I've saved it" }));
    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(WHAT_MOVES)).toBeVisible();
  });

  it("a claimed profile's code survives the offer's first tap: ending it takes a second, deliberate Show my code", async () => {
    const { backend } = await bootDevice({ registered: true });
    // A code made in the app the player claimed from, written down there.
    const made = await backend.identity.createSyncCode();
    if (!made.ok) throw new Error(made.error.code);
    restoredBy("claim");
    const playerId = storedIdentity()?.playerId;
    if (playerId === undefined) throw new Error("no identity");
    expect(readSyncRecord(playerId)).toBeNull();
    const before = JSON.stringify(backend.controls.inspect("syncCodes"));
    const create = vi.spyOn(backend.identity, "createSyncCode");

    const { user } = renderCard();
    await user.click(screen.getByRole("button", { name: "Show my code" }));
    const show = await screen.findByRole("button", { name: "Show my code" });
    // The card opened on its title, with the warning beside Show my code.
    expect(
      screen.getByRole("heading", { name: "Your sync code" }),
    ).toHaveFocus();
    expect(show).toHaveAccessibleDescription(
      "If you made a code before, showing one here makes the old one stop working.",
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(create).not.toHaveBeenCalled();
    expect(JSON.stringify(backend.controls.inspect("syncCodes"))).toBe(before);

    await user.click(show);
    await waitFor(() => {
      expect(document.querySelector("[data-sync-code]")).not.toBeNull();
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("a profile the backup cookie restored waits for the second tap too", async () => {
    const { backend } = await bootDevice({ registered: true });
    restoredBy("cookie");
    const create = vi.spyOn(backend.identity, "createSyncCode");
    const { user } = renderCard(offerContext({ earlierFinishes: 9 }));
    await user.click(screen.getByRole("button", { name: "Show my code" }));
    expect(
      await screen.findByText(
        "If you made a code before, showing one here makes the old one stop working.",
      ),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(create).not.toHaveBeenCalled();
  });

  it("on a device whose profile began here, the code arrives at once and takes the focus", async () => {
    await bootDevice({ registered: true });
    const { user } = renderCard();
    await user.click(screen.getByRole("button", { name: "Show my code" }));
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute("data-sync-code");
    });
    expect(document.activeElement).toHaveTextContent(/^.*Your sync code: /);
  });

  it("Not now dismisses it", async () => {
    await bootDevice({ registered: true });
    const { user, onDismiss } = renderCard();
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("speaks to a private window on its first finish", async () => {
    await bootDevice({ registered: true });
    renderCard(
      offerContext({
        earlierFinishes: 0,
        browser: { ...BROWSER, privateWindow: true } as typeof BROWSER,
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Private window?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your progress disappears when you close it. Save your sync code to keep it.",
      ),
    ).toBeVisible();
    expect(trackLog()).toContainEqual({
      name: "sync_code_offer",
      props: { trigger: "private_first" },
    });
  });
});
