/**
 * The stop screen's sync offer (PRD §3.10.2, §3.10.5): its copy, Show my
 * code opening the code in the card, accepted once the code is saved.
 */
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import {
  BROWSER,
  bootDevice,
  offerContext,
  resetDevice,
  trackLog,
} from "../__fixtures__/device";
import { WHAT_MOVES } from "../client-copy";
import { SyncCard } from "./sync-card";

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
