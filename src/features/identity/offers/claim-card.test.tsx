/**
 * The stop screen's claim card (PRD §3.10.4): the claim link for this app,
 * the address swap to /claim/<token>, the two taps, Open in Chrome on
 * Android, and the sync code below as the fallback, all in one card. The
 * offer counts as taken only once a link is live, the address never takes
 * a link the card is no longer there for, and the expiry is said and
 * hands focus back to Keep my streak.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EpochMs } from "@/engine/types";
import { getServerClock } from "@/platform/server-clock";
import { renderWithUser } from "@/test/render";
import { LIVE_REGION_IDS } from "@/ui/announce";

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
    // The two taps for WhatsApp, on iOS.
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "Tap WhatsApp's menu, the three dots (⋯) at the top or bottom of the screen.",
      "Choose Open in browser. Some versions say Open in Safari.",
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
      "Tap WhatsApp's menu, the three dots (⋮) at the top right.",
    );
  });

  it("gives each app its own two taps", async () => {
    await bootDevice({ registered: true });
    const { user } = renderCard({ ...WHATSAPP, app: "instagram" });
    expect(
      screen.getByRole("heading", { name: "Playing inside Instagram?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    await screen.findByRole("heading", {
      name: "Now open this page in your browser",
    });
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "Tap Instagram's menu, the three dots (⋯) at the top or bottom of the screen.",
      "Choose Open in external browser. Some versions say Open in Safari.",
    ]);
  });

  it("has the offer card's icon tile, and keeps one secondary action once the code shows", async () => {
    const { backend } = await bootDevice({ registered: true });
    const { user, container } = renderCard();
    const tile = container.querySelector("[data-claim-icon]");
    expect(tile).not.toBeNull();
    expect(tile).toHaveAttribute("aria-hidden", "true");
    const fallback = screen.getByRole("region", {
      name: "Or save your sync code",
    });
    const create = vi.spyOn(backend.identity, "createSyncCode");
    await user.click(
      await within(fallback).findByRole("button", { name: "Show my code" }),
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      await within(fallback).findByRole("button", { name: "Copy code" }),
    ).toHaveAttribute("data-variant", "text");
    expect(
      container.querySelectorAll('button[data-variant="secondary"]'),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Keep my streak" }),
    ).toHaveAttribute("data-variant", "secondary");
  });

  it("names no app when the in-app browser has none", async () => {
    await bootDevice({ registered: true });
    renderCard({ ...WHATSAPP, app: "other" });
    expect(
      screen.getByRole("heading", { name: "Playing inside an app?" }),
    ).toBeInTheDocument();
  });

  it("says so when the link can't be made, keeps the address and the offer, and lets the player try again", async () => {
    const { backend } = await bootDevice({ registered: true });
    backend.controls.failNext("identity.createClaim", "offline");
    window.history.replaceState(null, "", "/daily/42/results");
    const { user, onAccept } = renderCard();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    expect(
      await screen.findByText(/Making a link needs a connection/, {
        selector: "[data-claim-message]",
      }),
    ).toBeVisible();
    expect(window.location.pathname).toBe("/daily/42/results");
    // No link, so the offer wasn't taken: it may come back on a later finish.
    expect(onAccept).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/^\/claim\//);
    });
    // Taken once the link is live.
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("doesn't count a tap that couldn't make a link as taking the offer", async () => {
    const { backend } = await bootDevice({ registered: true });
    backend.controls.failNext("identity.createClaim", "rate_limited");
    const { user, onAccept } = renderCard();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    expect(
      await screen.findByText(/That's a lot of links for one hour/, {
        selector: "[data-claim-message]",
      }),
    ).toBeVisible();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("Not now dismisses the card", async () => {
    await bootDevice({ registered: true });
    const { user, onDismiss } = renderCard();
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("leaves the address alone when the card goes while the link is being made", async () => {
    const { backend } = await bootDevice({ registered: true });
    backend.controls.setLatency(300);
    window.history.replaceState(null, "", "/daily/42/results");
    const { user, unmount, onAccept } = renderCard();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    expect(
      screen.getByRole("button", { name: "Keep my streak" }),
    ).toHaveAttribute("aria-busy", "true");
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(window.location.pathname).toBe("/daily/42/results");
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("when the link runs out, says so in the status region through the address change, and gives Keep my streak the focus", async () => {
    await bootDevice({ registered: true });
    window.history.replaceState(null, "", "/daily/42/results");
    // The device's clock reads past the claim's 10 minutes: it runs out at once.
    const clock = getServerClock();
    const now = clock.now();
    const late = vi
      .spyOn(clock, "now")
      .mockReturnValue((now + 11 * 60_000) as EpochMs);
    const { user } = renderCard();
    await user.click(screen.getByRole("button", { name: "Keep my streak" }));
    const message = await screen.findByText(
      "That link has run out. Tap Keep my streak for a new one.",
      { selector: "[data-claim-message]" },
    );
    expect(message).toBeVisible();
    expect(window.location.pathname).toBe("/daily/42/results");
    const keep = screen.getByRole("button", { name: "Keep my streak" });
    await waitFor(() => {
      expect(keep).toHaveFocus();
    });
    // Said politely, and kept through the address change (the shell clears
    // a page's messages when its address changes, all but kept ones).
    const said = document.getElementById(
      LIVE_REGION_IDS.polite,
    )?.firstElementChild;
    expect(said).toHaveTextContent(
      "That link has run out. Tap Keep my streak for a new one.",
    );
    expect(said).toHaveAttribute("data-qz-keep");
    // A new link withdraws the line.
    late.mockRestore();
    await user.click(keep);
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/^\/claim\//);
    });
    expect(
      document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "",
    ).not.toContain("That link has run out");
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
