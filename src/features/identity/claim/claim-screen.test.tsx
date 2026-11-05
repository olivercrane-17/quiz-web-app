/**
 * The claim link in the system browser (PRD §3.10.4, §5.14; DESIGN §12.27):
 * the preview, Continue redeeming it as a credential of the same player,
 * the expired-claim copy for a used, expired or unknown link, the browser
 * that made the link, the confirm step on a browser with progress, the
 * limit's exact wait, and a spent claim stored whatever else stalls.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseLocalDate, type EpochMs, type LocalDate } from "@/engine/types";
import type * as BrowserContextModule from "@/platform/browser-context";
import { renderWithUser } from "@/test/render";

/** Lets a test stall the browser detection, as a chunk that never loads would. */
const detection = vi.hoisted(() => ({ stalled: false }));
vi.mock("@/platform/browser-context", async (importOriginal) => {
  const actual = await importOriginal<typeof BrowserContextModule>();
  return {
    ...actual,
    detectBrowserContext: () =>
      detection.stalled
        ? new Promise<never>(() => {})
        : actual.detectBrowserContext(),
  };
});

import {
  bootDevice,
  resetDevice,
  seedPlayer,
  storedIdentity,
  trackLog,
} from "../__fixtures__/device";
import { WHAT_MOVES } from "../client-copy";
import { mintClaimToken } from "../mint";
import { RESTORE_NOTICE_KEY } from "../notice-flag";
import { restoreNavigation } from "../restore-flow";
import { rememberClaim } from "../sync-store";
import { ClaimFlow } from "./claim-screen";

afterEach(() => {
  detection.stalled = false;
  resetDevice();
});

const EXPIRED_COPY =
  "This link has expired. Go back to the app where you played and tap 'Keep my streak' again, or use your sync code.";

function stubNavigation() {
  return vi.spyOn(restoreNavigation, "go").mockImplementation(() => {});
}

/** Today in the device's zone, as the mock dates a Daily. */
function today(): LocalDate {
  return parseLocalDate(
    new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date()),
  ) as LocalDate;
}

describe("the claim page", () => {
  it("previews the player and, on Continue, makes this browser that player", async () => {
    const { backend, calls } = await bootDevice();
    const token = mintClaimToken();
    const playerId = await seedPlayer(backend, {
      claim: { token },
      friendlyName: "Plucky Otter",
      finished: [{ date: today(), dailyNumber: 42 }],
    });
    const go = stubNavigation();
    const { user } = renderWithUser(<ClaimFlow token={token} />);

    const card = await screen.findByRole("region", {
      name: "Continue as Plucky Otter?",
    });
    expect(
      within(card).getByText(/^Streak 1 · Daily No.\s42 done$/),
    ).toBeVisible();
    expect(within(card).getByText(WHAT_MOVES)).toBeVisible();
    expect(
      within(card).getByRole("button", { name: "Continue" }),
    ).toHaveAttribute("data-variant", "primary");
    expect(
      within(card).getByRole("link", { name: "This isn't me" }),
    ).toHaveAttribute("href", "/");

    await user.click(within(card).getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expect(go).toHaveBeenCalledWith("/");
    });
    expect(storedIdentity()).toMatchObject({
      playerId,
      registered: true,
      source: "claim",
    });
    expect(
      JSON.parse(sessionStorage.getItem(RESTORE_NOTICE_KEY) ?? "null"),
    ).toEqual({ v: 1, kind: "claim", playerId, streak: 1 });
    await waitFor(() => {
      expect(
        calls.some(
          (call) => call.url === "/api/identity" && call.method === "POST",
        ),
      ).toBe(true);
    });
    expect(trackLog()).toEqual(
      expect.arrayContaining([
        { name: "claim_link_used", props: { app: "none", result: "ok" } },
        { name: "identity_restored", props: { source: "claim" } },
      ]),
    );
  });

  it("shows the expired-claim copy for a used link, with Enter a sync code", async () => {
    const { backend } = await bootDevice();
    const token = mintClaimToken();
    await seedPlayer(backend, {
      claim: { token, redeemedAt: (Date.now() - 1000) as EpochMs },
    });
    renderWithUser(<ClaimFlow token={token} />);
    expect(await screen.findByText(EXPIRED_COPY)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Enter a sync code" }),
    ).toHaveAttribute("href", "/restore");
    await waitFor(() => {
      expect(trackLog()).toContainEqual({
        name: "claim_link_used",
        props: { app: "none", result: "used" },
      });
    });
  });

  it("shows the expired-claim copy for a link past its 10 minutes", async () => {
    const { backend } = await bootDevice();
    const token = mintClaimToken();
    await seedPlayer(backend, {
      claim: { token, expiresAt: (Date.now() - 1000) as EpochMs },
    });
    renderWithUser(<ClaimFlow token={token} />);
    expect(await screen.findByText(EXPIRED_COPY)).toBeVisible();
    await waitFor(() => {
      expect(trackLog()).toContainEqual({
        name: "claim_link_used",
        props: { app: "none", result: "expired" },
      });
    });
  });

  it("shows the expired-claim copy for a link nobody holds, and with no token at all", async () => {
    await bootDevice();
    const { unmount } = renderWithUser(<ClaimFlow token={mintClaimToken()} />);
    expect(await screen.findByText(EXPIRED_COPY)).toBeVisible();
    unmount();
    renderWithUser(<ClaimFlow token={null} />);
    expect(await screen.findByText(EXPIRED_COPY)).toBeVisible();
  });

  it("turns expired when the link is used elsewhere before Continue", async () => {
    const { backend } = await bootDevice();
    const token = mintClaimToken();
    await seedPlayer(backend, { claim: { token } });
    const { user } = renderWithUser(<ClaimFlow token={token} />);
    const go = stubNavigation();
    const card = await screen.findByRole("region", {
      name: /^Continue as/,
    });
    await backend.context.store.write((db) => {
      for (const row of Object.values(
        db.claims as Record<string, { redeemedAt: number | null }>,
      )) {
        row.redeemedAt = Date.now();
      }
    });
    await user.click(within(card).getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText(EXPIRED_COPY, {
        selector: "[data-claim-state] p",
      }),
    ).toBeVisible();
    expect(go).not.toHaveBeenCalled();
  });

  it("says the profile is already here when the link opens in the browser that made it, and never redeems it", async () => {
    const { backend } = await bootDevice({ registered: true });
    const token = mintClaimToken();
    const playerId = storedIdentity()?.playerId;
    if (playerId === undefined) throw new Error("no identity");
    rememberClaim(playerId, {
      token,
      expiresAt: (Date.now() + 60_000) as EpochMs,
    });
    const peek = vi.spyOn(backend.identity, "peekClaim");
    const redeem = vi.spyOn(backend.identity, "redeemClaim");
    renderWithUser(<ClaimFlow token={token} />);
    expect(
      await screen.findByText(/You made this link on this device/),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(peek).not.toHaveBeenCalled();
    expect(redeem).not.toHaveBeenCalled();
  });

  it("asks first on a browser with its own progress; Cancel keeps its identity", async () => {
    const { backend } = await bootDevice({ registered: true });
    const token = mintClaimToken();
    const playerId = await seedPlayer(backend, { claim: { token } });
    const before = storedIdentity();
    const go = stubNavigation();
    const { user } = renderWithUser(<ClaimFlow token={token} />);
    const card = await screen.findByRole("region", { name: /^Continue as/ });

    await user.click(within(card).getByRole("button", { name: "Continue" }));
    let dialog = await screen.findByRole("dialog", {
      name: "Replace this device's progress?",
    });
    expect(
      within(dialog).getByText(
        "This device has its own progress. Continuing replaces it with the profile from your link.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByText(WHAT_MOVES)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(storedIdentity()).toEqual(before);

    await user.click(within(card).getByRole("button", { name: "Continue" }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expect(go).toHaveBeenCalledWith("/");
    });
    expect(storedIdentity()?.playerId).toBe(playerId);
  });

  it("stores the claimed identity at once, even when the browser detection never answers", async () => {
    detection.stalled = true;
    const { backend } = await bootDevice();
    const token = mintClaimToken();
    const playerId = await seedPlayer(backend, { claim: { token } });
    const go = stubNavigation();
    const { user } = renderWithUser(<ClaimFlow token={token} />);
    const card = await screen.findByRole("region", { name: /^Continue as/ });
    await user.click(within(card).getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expect(go).toHaveBeenCalledWith("/");
    });
    expect(storedIdentity()).toMatchObject({ playerId, source: "claim" });
    expect(trackLog()).toContainEqual({
      name: "claim_link_used",
      props: { app: "none", result: "ok" },
    });
  });

  it("on a browser whose only progress is practice, says its practice stays", async () => {
    const { backend } = await bootDevice();
    const token = mintClaimToken();
    const playerId = await seedPlayer(backend, { claim: { token } });
    localStorage.setItem("qz:history", JSON.stringify([{ runId: "r1" }]));
    const go = stubNavigation();
    const { user } = renderWithUser(<ClaimFlow token={token} />);
    const card = await screen.findByRole("region", { name: /^Continue as/ });
    await user.click(within(card).getByRole("button", { name: "Continue" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Bring your profile to this browser?",
    });
    expect(
      within(dialog).getByText(
        "Your practice stats in this browser stay here. Continuing brings in the streak and Daily history from your link.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByText(WHAT_MOVES)).toBeVisible();
    expect(dialog.textContent).not.toMatch(/replace/i);
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expect(go).toHaveBeenCalledWith("/");
    });
    expect(storedIdentity()?.playerId).toBe(playerId);
  });

  it("says exactly how long to wait after too many tries, and keeps Try again off until then", async () => {
    const { backend } = await bootDevice();
    const token = mintClaimToken();
    await seedPlayer(backend, { claim: { token } });
    // The mock's limit asks for a one-second wait.
    backend.controls.failNext("identity.peekClaim", "rate_limited");
    const { user } = renderWithUser(<ClaimFlow token={token} />);
    expect(
      await screen.findByText("Too many tries. Please wait 1 minute."),
    ).toBeVisible();
    const retry = screen.getByRole("button", { name: "Try again" });
    // Still focusable, so it can be found, but off while the wait lasts.
    expect(retry).toHaveAttribute("aria-disabled", "true");
    expect(retry).toBeEnabled();
    const peek = vi.spyOn(backend.identity, "peekClaim");
    await user.click(retry);
    expect(peek).not.toHaveBeenCalled();
    await waitFor(
      () => {
        expect(retry).not.toHaveAttribute("aria-disabled");
      },
      { timeout: 3000 },
    );
    await user.click(retry);
    expect(
      await screen.findByRole("region", { name: /^Continue as/ }),
    ).toBeInTheDocument();
    expect(peek).toHaveBeenCalledTimes(1);
  });

  it("offers Try again when the server can't be reached", async () => {
    const { backend } = await bootDevice();
    const token = mintClaimToken();
    await seedPlayer(backend, { claim: { token } });
    backend.controls.failNext("identity.peekClaim", "unreachable");
    const { user } = renderWithUser(<ClaimFlow token={token} />);
    expect(await screen.findByText(/That didn't reach us/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("region", { name: /^Continue as/ }),
    ).toBeInTheDocument();
  });
});
