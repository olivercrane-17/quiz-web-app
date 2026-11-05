/**
 * Restore from a code (PRD §3.10.2, §5.13; DESIGN §12.26): the typed forms
 * of a code (AC-SYN-02), the confirm step on a device with progress and
 * its Cancel (AC-SYN-06, AC-SYN-07), the switch to the restored player
 * with its backup cookie and Today's note, and the refusals' copy. Before
 * hydration nothing can submit the code natively.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSyncCode, type SyncCode } from "@/engine/types";
import { readCachedProfile } from "@/platform/identity/profile";
import { renderWithUser } from "@/test/render";

import {
  bootDevice,
  resetDevice,
  seedPlayerWithCode,
  storedIdentity,
  trackLog,
} from "../__fixtures__/device";
import { WHAT_MOVES } from "../client-copy";
import { RESTORE_NOTICE_KEY } from "../notice-flag";
import { restoreNavigation } from "../restore-flow";
import { readSyncRecord } from "../sync-store";
import { RestoreScreen } from "./restore-screen";

const CODE = parseSyncCode("K7QX2M9PT4RW8H10") as SyncCode;

afterEach(() => {
  resetDevice();
});

function stubNavigation() {
  return vi.spyOn(restoreNavigation, "go").mockImplementation(() => {});
}

function field() {
  return screen.getByRole("textbox", { name: "Your sync code" });
}

/** The error under the field (the status region says it too). */
const UNDER_FIELD = { selector: "[data-restore-error]" } as const;

describe("restoring from a code", () => {
  it("AC-SYN-02 lower case, no hyphens, I for 1 and O for 0 restore the same code, grouped as typed", async () => {
    const { backend } = await bootDevice();
    const playerId = await seedPlayerWithCode(backend, CODE);
    const go = stubNavigation();
    const { user } = renderWithUser(<RestoreScreen />);
    await user.type(field(), "k7qx 2m9p-t4rw 8hIO");
    expect(field()).toHaveValue("K7QX-2M9P-T4RW-8H10");
    await user.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(go).toHaveBeenCalledWith("/");
    });
    // The device is the restored player now, with a secret of its own.
    expect(storedIdentity()).toMatchObject({
      playerId,
      registered: true,
      source: "sync",
    });
    expect(readCachedProfile(playerId)?.friendlyName).toBe("Plucky Otter");
    // The code it came with is kept, already saved.
    expect(readSyncRecord(playerId)).toMatchObject({ code: CODE });
    expect(readSyncRecord(playerId)?.savedAt).not.toBeNull();
    expect(
      JSON.parse(sessionStorage.getItem(RESTORE_NOTICE_KEY) ?? "null"),
    ).toEqual({ v: 1, kind: "sync", playerId, streak: 0 });
    expect(trackLog()).toEqual(
      expect.arrayContaining([
        {
          name: "sync_code_redeem",
          props: { result: "ok", replaced_progress: false },
        },
        { name: "identity_restored", props: { source: "sync_code" } },
      ]),
    );
  });

  it("posts the restored identity to the backup cookie", async () => {
    const { backend, calls } = await bootDevice();
    const playerId = await seedPlayerWithCode(backend, CODE);
    stubNavigation();
    const { user } = renderWithUser(<RestoreScreen />);
    await user.type(field(), CODE);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => {
      expect(
        calls.filter(
          (call) => call.url === "/api/identity" && call.method === "POST",
        ),
      ).toHaveLength(1);
    });
    const post = calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({
      playerId,
      secret: storedIdentity()?.secret,
    });
    await waitFor(() => {
      expect(storedIdentity()?.cookieSavedAt).not.toBeNull();
    });
  });

  it("AC-SYN-06 restoring onto a device with progress shows the confirm step; cancelling keeps the device's identity", async () => {
    const { backend } = await bootDevice({ registered: true });
    await seedPlayerWithCode(backend, CODE);
    const before = storedIdentity();
    const go = stubNavigation();
    const redeem = vi.spyOn(backend.identity, "redeemSyncCode");
    const { user } = renderWithUser(<RestoreScreen />);
    await user.type(field(), CODE);
    await user.click(screen.getByRole("button", { name: "Restore" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Replace this device's progress?",
    });
    expect(
      within(dialog).getByText(
        "This device has its own progress. Restoring replaces it with the profile from your code.",
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(redeem).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
    expect(storedIdentity()).toEqual(before);
  });

  it("AC-SYN-07 the restore confirm step says what comes with the player and what stays", async () => {
    const { backend } = await bootDevice({ registered: true });
    const playerId = await seedPlayerWithCode(backend, CODE);
    const go = stubNavigation();
    const { user } = renderWithUser(<RestoreScreen />);
    await user.type(field(), CODE);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(WHAT_MOVES)).toBeVisible();
    // Confirming replaces the device's identity.
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => {
      expect(go).toHaveBeenCalledWith("/");
    });
    expect(storedIdentity()?.playerId).toBe(playerId);
    expect(trackLog()).toContainEqual({
      name: "sync_code_redeem",
      props: { result: "ok", replaced_progress: true },
    });
  });

  it("treats a device with practice history as having progress, and says its practice stays", async () => {
    const { backend } = await bootDevice();
    const playerId = await seedPlayerWithCode(backend, CODE);
    localStorage.setItem("qz:history", JSON.stringify([{ runId: "r1" }]));
    const go = stubNavigation();
    const { user } = renderWithUser(<RestoreScreen />);
    // The check runs after the boot.
    await waitFor(() => {
      expect(field()).toBeEnabled();
    });
    await user.type(field(), CODE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    // Practice is all this device has, and it stays: nothing is "replaced".
    const dialog = await screen.findByRole("dialog", {
      name: "Restore your profile here?",
    });
    expect(
      within(dialog).getByText(
        "Your practice stats on this device stay here. Restoring brings in the streak and Daily history from your code.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByText(WHAT_MOVES)).toBeVisible();
    expect(dialog.textContent).not.toMatch(/replace/i);
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => {
      expect(go).toHaveBeenCalledWith("/");
    });
    expect(storedIdentity()?.playerId).toBe(playerId);
    // Practice stays on the device.
    expect(localStorage.getItem("qz:history")).toBe(
      JSON.stringify([{ runId: "r1" }]),
    );
  });

  it("asks for the code when nothing was typed, without asking the server", async () => {
    const { backend } = await bootDevice();
    const redeem = vi.spyOn(backend.identity, "redeemSyncCode");
    const { user } = renderWithUser(<RestoreScreen />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText(
        "Enter your sync code first. It has 16 characters.",
        UNDER_FIELD,
      ),
    ).toBeVisible();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveFocus();
    expect(redeem).not.toHaveBeenCalled();
  });

  it("counts the characters of a half-typed code, without asking the server", async () => {
    const { backend } = await bootDevice();
    const redeem = vi.spyOn(backend.identity, "redeemSyncCode");
    const { user } = renderWithUser(<RestoreScreen />);
    await user.type(field(), "K7QX-2M9P");
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText(
        "Your code has 16 characters. This one has 8.",
        UNDER_FIELD,
      ),
    ).toBeVisible();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveFocus();
    expect(redeem).not.toHaveBeenCalled();
  });

  it("says a full-length code that can't be one didn't work, without asking the server", async () => {
    const { backend } = await bootDevice();
    const redeem = vi.spyOn(backend.identity, "redeemSyncCode");
    const { user } = renderWithUser(<RestoreScreen />);
    // U is no Crockford character, so no code holds one.
    await user.type(field(), "UUUU-UUUU-UUUU-UUUU");
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText(
        "That code didn't work. Check for typos, or make a new code on your other device.",
        UNDER_FIELD,
      ),
    ).toBeVisible();
    expect(redeem).not.toHaveBeenCalled();
  });

  it("restores on Enter in the field, as on Go on a phone's keyboard", async () => {
    const { backend } = await bootDevice();
    const playerId = await seedPlayerWithCode(backend, CODE);
    const go = stubNavigation();
    const { user } = renderWithUser(<RestoreScreen />);
    await user.type(field(), `${CODE}{Enter}`);
    await waitFor(() => {
      expect(go).toHaveBeenCalledWith("/");
    });
    expect(storedIdentity()?.playerId).toBe(playerId);
    // The code holds no line break.
    expect(field()).toHaveValue("K7QX-2M9P-T4RW-8H10");
  });

  it("can't submit the code natively before it hydrates: the field has no name and Restore is disabled", () => {
    // The prerendered HTML, as the browser has it until the page hydrates.
    const page = document.createElement("div");
    page.innerHTML = renderToString(<RestoreScreen />);
    const form = page.querySelector("form");
    const restore = page.querySelector('button[type="submit"]');
    expect(form).not.toBeNull();
    // Nothing a native submission would carry, and no button to send it.
    expect(form?.querySelectorAll("[name]")).toHaveLength(0);
    expect(restore).toHaveTextContent("Restore");
    expect(restore).toHaveAttribute("disabled");
    expect(form?.querySelector("textarea")).not.toBeNull();
  });

  it("enables Restore once the page has hydrated", async () => {
    await bootDevice();
    renderWithUser(<RestoreScreen />);
    expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled();
    expect(field()).not.toHaveAttribute("name");
  });

  it("says an unknown code didn't work", async () => {
    await bootDevice();
    const { user } = renderWithUser(<RestoreScreen />);
    await user.type(field(), "0000-0000-0000-0000");
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText(/That code didn't work/, UNDER_FIELD),
    ).toBeVisible();
    expect(trackLog()).toContainEqual({
      name: "sync_code_redeem",
      props: { result: "bad", replaced_progress: false },
    });
  });

  it("says to wait after too many tries, with the daily cap's own words", async () => {
    const { backend } = await bootDevice();
    backend.controls.failNext("identity.redeemSyncCode", "rate_limited");
    const { user } = renderWithUser(<RestoreScreen />);
    await user.type(field(), CODE);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText(
        "Too many tries. Please wait 15 minutes.",
        UNDER_FIELD,
      ),
    ).toBeVisible();
    expect(trackLog()).toContainEqual({
      name: "sync_code_redeem",
      props: { result: "rate_limited", replaced_progress: false },
    });
  });

  it("says restoring needs a connection when offline", async () => {
    await bootDevice();
    const { user } = renderWithUser(<RestoreScreen />);
    await user.type(field(), CODE);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText(
        "Restoring needs a connection. Try again once you're online.",
        UNDER_FIELD,
      ),
    ).toBeVisible();
    expect(trackLog()).toContainEqual({
      name: "offline_state_shown",
      props: { feature: "restore" },
    });
  });
});
