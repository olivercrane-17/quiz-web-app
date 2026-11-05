/**
 * The sync code (PRD §3.10.2, DESIGN §12.25): asked for only on Show my
 * code, shown in four groups and spelled for screen readers, saved with
 * Copy code or I've saved it, replaced behind a confirm, offline once it
 * is on the device, and nothing to show before a first Daily.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatSyncCode, parseSyncCode, type SyncCode } from "@/engine/types";
import { renderWithUser } from "@/test/render";

import {
  bootDevice,
  resetDevice,
  storedIdentity,
  trackLog,
} from "../__fixtures__/device";
import { readSyncRecord, storeSyncCode } from "../sync-store";
import { SyncCodePanel, spokenCode } from "./sync-code-panel";

afterEach(() => {
  resetDevice();
});

const CODE = parseSyncCode("K7QX2M9PT4RW8HNC") as SyncCode;

function playerId() {
  const id = storedIdentity()?.playerId;
  if (id === undefined) throw new Error("no identity");
  return id;
}

/** The code the panel shows, as its data attribute holds it. */
async function shownCode(): Promise<string> {
  const well = await waitFor(() => {
    const found = document.querySelector("[data-sync-code]");
    if (found === null) throw new Error("no code yet");
    return found;
  });
  return well.getAttribute("data-sync-code") ?? "";
}

describe("SyncCodePanel", () => {
  it("has nothing to show before the first Daily", async () => {
    await bootDevice();
    renderWithUser(<SyncCodePanel trigger="manual" />);
    expect(
      await screen.findByText(/Your sync code arrives with your first Daily/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Play today's Daily" }),
    ).toHaveAttribute("href", "/daily");
  });

  it("asks the server for a code only on Show my code, then keeps it on the device", async () => {
    const { backend } = await bootDevice({ registered: true });
    const { user } = renderWithUser(<SyncCodePanel trigger="manual" />);
    const show = await screen.findByRole("button", { name: "Show my code" });
    expect(backend.controls.inspect("syncCodes")).toBeUndefined();
    await user.click(show);
    const code = await shownCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(screen.getByText(formatSyncCode(code as SyncCode))).toBeVisible();
    expect(readSyncRecord(playerId())).toMatchObject({ code, savedAt: null });
    // Screen readers hear it one character at a time, group by group.
    expect(
      screen.getByText(`Your sync code: ${spokenCode(code as SyncCode)}`),
    ).toBeInTheDocument();
    expect(spokenCode(CODE)).toBe("K 7 Q X, 2 M 9 P, T 4 R W, 8 H N C");
    expect(
      screen.getByText(
        "Anyone with this code can play as you, so keep it private.",
      ),
    ).toBeVisible();
  });

  it("shows a stored code without asking the server, so it works offline", async () => {
    const { backend } = await bootDevice({ registered: true });
    storeSyncCode(playerId(), CODE, Date.now());
    const create = vi.spyOn(backend.identity, "createSyncCode");
    renderWithUser(<SyncCodePanel trigger="manual" />);
    expect(await shownCode()).toBe(CODE);
    expect(screen.getByText("K7QX-2M9P-T4RW-8HNC")).toBeVisible();
    expect(create).not.toHaveBeenCalled();
  });

  it("counts Copy code as saved: the code goes to the clipboard, the device records it and sync_code_saved is logged", async () => {
    await bootDevice({ registered: true });
    storeSyncCode(playerId(), CODE, Date.now());
    const onSaved = vi.fn();
    const { user } = renderWithUser(
      <SyncCodePanel trigger="third_daily" onSaved={onSaved} />,
    );
    await user.click(await screen.findByRole("button", { name: "Copy code" }));
    // user-event's clipboard stands in for the browser's.
    expect(await navigator.clipboard.readText()).toBe("K7QX-2M9P-T4RW-8HNC");
    expect(onSaved).toHaveBeenCalledWith("copy");
    expect(readSyncRecord(playerId())?.savedAt).not.toBeNull();
    expect(trackLog()).toContainEqual({
      name: "sync_code_saved",
      props: { trigger: "third_daily", method: "copy" },
    });
    expect(
      screen.getByText(
        "Saved. You'll find it here again in Me, then Your sync code.",
      ),
    ).toBeVisible();
  });

  it("counts I've saved it as saved too", async () => {
    await bootDevice({ registered: true });
    storeSyncCode(playerId(), CODE, Date.now());
    const { user } = renderWithUser(<SyncCodePanel trigger="manual" />);
    await user.click(
      await screen.findByRole("button", { name: "I've saved it" }),
    );
    expect(trackLog()).toContainEqual({
      name: "sync_code_saved",
      props: { trigger: "manual", method: "confirm" },
    });
  });

  it("says how to copy by hand when the clipboard refuses", async () => {
    await bootDevice({ registered: true });
    storeSyncCode(playerId(), CODE, Date.now());
    const { user } = renderWithUser(<SyncCodePanel trigger="manual" />);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );
    await user.click(await screen.findByRole("button", { name: "Copy code" }));
    expect(
      await screen.findByText(/We couldn't copy it/, {
        selector: "[data-sync-copy-failed]",
      }),
    ).toBeVisible();
    expect(readSyncRecord(playerId())?.savedAt).toBeNull();
  });

  it("makes a new code behind a confirm, which ends the old one", async () => {
    const { backend } = await bootDevice({ registered: true });
    const { user } = renderWithUser(
      <SyncCodePanel trigger="manual" allowNew />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Show my code" }),
    );
    const first = await shownCode();

    await user.click(screen.getByRole("button", { name: "Make a new code" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Make a new code?",
    });
    expect(
      within(dialog).getByText("Your old code will stop working."),
    ).toBeVisible();
    // Cancel changes nothing.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await shownCode()).toBe(first);

    await user.click(screen.getByRole("button", { name: "Make a new code" }));
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Make a new code?" }),
      ).getByRole("button", { name: "Make a new code" }),
    );
    await waitFor(async () => {
      expect(await shownCode()).not.toBe(first);
    });
    const second = await shownCode();
    expect(readSyncRecord(playerId())?.code).toBe(second);
    // The old code is dead on the server.
    const redeemed = await backend.identity.redeemSyncCode(
      first,
      storedIdentity()?.secret ?? ("" as never),
    );
    expect(redeemed.ok ? "ok" : redeemed.error.code).toBe("not_found");
  });

  it("says a first code needs a connection, and tries again", async () => {
    const { backend } = await bootDevice({ registered: true });
    backend.controls.failNext("identity.createSyncCode", "offline");
    const { user } = renderWithUser(<SyncCodePanel trigger="manual" />);
    await user.click(
      await screen.findByRole("button", { name: "Show my code" }),
    );
    expect(
      await screen.findByText(
        /Your sync code needs a connection the first time/,
        { selector: "[data-sync-error] p" },
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await shownCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it("warns that showing a code ends an older one on a restored profile", async () => {
    await bootDevice({ registered: true });
    const identity = storedIdentity();
    localStorage.setItem(
      "qz:identity",
      JSON.stringify({ ...identity, source: "cookie" }),
    );
    renderWithUser(<SyncCodePanel trigger="manual" />);
    expect(
      await screen.findByText(
        "If you made a code before, showing one here makes the old one stop working.",
      ),
    ).toBeVisible();
  });

  it("asks for a code at once when the tap was Show my code", async () => {
    await bootDevice({ registered: true });
    renderWithUser(<SyncCodePanel trigger="third_daily" autoCreate />);
    expect(await shownCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  });
});
