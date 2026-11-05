/**
 * The stop screen's claim card (PRD §3.10.4): the claim link for this app,
 * the address swap to /claim/<token>, the two taps, Open in Chrome on
 * Android, and the sync code below as the fallback, all in one card.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import {
  WHATSAPP,
  bootDevice,
  offerContext,
  resetDevice,
  storedIdentity,
  trackLog,
} from "../__fixtures__/device";
import { WHAT_MOVES } from "../client-copy";
import { readSyncRecord } from "../sync-store";
import { ClaimCard } from "./claim-card";

afterEach(() => {
  resetDevice();
});

function renderCard(browser = WHATSAPP) {
  const onAccept = vi.fn();
  const onDismiss = vi.fn();
  const view = renderWithUser(
    <ClaimCard
      ctx={offerContext({ browser })}
      onAccept={onAccept}
      onDismiss={onDismiss}
    />,
  );
  return { ...view, onAccept, onDismiss };
}

describe("the claim card", () => {
  it("AC-IAB-03 tapping Keep my streak swaps the address to /claim/<token> and shows the two taps", async () => {
    const { backend } = await bootDevice({ registered: true });
    window.history.replaceState(null, "", "/daily/42/results");
    const { user, onAccept } = renderCard();

    expect(
      screen.getByRole("heading", { name: "Playing inside WhatsApp?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));

    await waitFor(() => {
      expect(window.location.pathname).toMatch(/^\/claim\/[A-Za-z0-9_-]{32,}$/);
    });
    const token = window.location.pathname.slice("/claim/".length);
    expect(onAccept).toHaveBeenCalledTimes(1);
    const steps = await screen.findByRole("heading", {
      name: "Now open this page in your browser",
    });
    expect(steps).toHaveFocus();
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "Tap the three dots (⋯) at the top or bottom of the screen.",
      "Choose Open in Safari. Some apps call it Open in browser.",
    ]);
    expect(screen.getByText("This link works for 10 minutes.")).toBeVisible();
    // iOS has no Chrome intent.
    expect(screen.queryByRole("link", { name: "Open in Chrome" })).toBeNull();

    // The device remembers its own link, and the server holds its hash.
    const playerId = storedIdentity()?.playerId;
    if (playerId === undefined) throw new Error("no identity");
    expect(readSyncRecord(playerId)?.claim?.token).toBe(token);
    const claims = backend.controls.inspect<Record<string, unknown>>("claims");
    expect(Object.keys(claims)).toEqual([playerId]);
    expect(JSON.stringify(claims)).not.toContain(token);
  });

  it("AC-SYN-05 inside WhatsApp the sync code sits below the claim offer, in the same card", async () => {
    await bootDevice({ registered: true });
    renderCard();
    const claim = screen.getByRole("region", {
      name: "Playing inside WhatsApp?",
    });
    const fallback = screen.getByRole("region", {
      name: "Or save your sync code",
    });
    // Below the claim, in reading order.
    expect(
      claim.compareDocumentPosition(fallback) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      await within(fallback).findByRole("button", { name: "Show my code" }),
    ).toBeVisible();
    expect(trackLog()).toEqual(
      expect.arrayContaining([
        { name: "claim_link_offer", props: { app: "whatsapp" } },
        { name: "sync_code_offer", props: { trigger: "in_app_first" } },
      ]),
    );
  });

  it("AC-SYN-07 the claim card says what comes with the player and what stays", async () => {
    await bootDevice({ registered: true });
    renderCard();
    expect(screen.getByText(WHAT_MOVES)).toBeVisible();
    expect(WHAT_MOVES).toBe(
      "Your streak, Daily history, Groups, challenges and achievements come with you. Practice stats stay on this device.",
    );
  });

  it("AC-IAB-05 the claim card pitches no install, push or calendar", async () => {
    await bootDevice({ registered: true });
    const { user, container } = renderCard();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    await screen.findByRole("heading", {
      name: "Now open this page in your browser",
    });
    expect(container.textContent).not.toMatch(
      /install|home screen|notification|calendar|reminder/i,
    );
  });

  it("offers Open in Chrome on Android, through an intent link to the claim", async () => {
    await bootDevice({ registered: true });
    const { user } = renderCard({ ...WHATSAPP, platform: "android" });
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    const chrome = await screen.findByRole("link", { name: "Open in Chrome" });
    const path = window.location.pathname;
    expect(chrome).toHaveAttribute(
      "href",
      `intent://${window.location.host}${path}#Intent;scheme=http;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(
        `http://${window.location.host}${path}`,
      )};end`,
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      "Tap the three dots (⋮) at the top right.",
    );
  });

  it("names no app when the in-app browser has none", async () => {
    await bootDevice({ registered: true });
    renderCard({ ...WHATSAPP, app: "other" });
    expect(
      screen.getByRole("heading", { name: "Playing inside an app?" }),
    ).toBeInTheDocument();
  });

  it("says so when the link can't be made, keeps the address, and lets the player try again", async () => {
    const { backend } = await bootDevice({ registered: true });
    backend.controls.failNext("identity.createClaim", "offline");
    window.history.replaceState(null, "", "/daily/42/results");
    const { user, onAccept } = renderCard();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    expect(
      await screen.findByText(/Making a link needs a connection/),
    ).toBeVisible();
    expect(window.location.pathname).toBe("/daily/42/results");
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/^\/claim\//);
    });
    // Accepted once, however many tries it took.
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("Not now dismisses the card", async () => {
    await bootDevice({ registered: true });
    const { user, onDismiss } = renderCard();
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("puts the address back when the card goes while the link shows", async () => {
    await bootDevice({ registered: true });
    window.history.replaceState(null, "", "/daily/42/results");
    const { user, unmount } = renderCard();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/^\/claim\//);
    });
    unmount();
    expect(window.location.pathname).toBe("/daily/42/results");
  });
});
