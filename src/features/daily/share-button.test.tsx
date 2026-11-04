/**
 * The Share button the stop screen and the finished home card mount
 * (`@/features/share/share-button`, SHR-1's extension point, built as a
 * greybox for RITE round 1's R1-01): Web Share, then the clipboard, then a
 * selected text box, with the share events PRD §3.5.2 counts. The tests sit
 * here, beside the two surfaces that use it, until SHR-1 takes the file.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackedEvent } from "@/features/analytics/track";
import {
  COPIED_MS,
  SHARE_BUTTON_COPY,
  ShareButton,
  type SharePayload,
} from "@/features/share/share-button";
import { LIVE_REGION_IDS } from "@/ui/announce";

const TEXT = [
  "Knewt Daily #42 · 9/12 · Encore off by 4% 🎯",
  "History ✅⬜⬜⬜",
  "Geography 🟧✅⬜⬜",
  "Science & Tech 🟧🟧✅⬜",
  "https://knewt.app/daily",
].join("\n");
const PAYLOAD: SharePayload = { text: TEXT, mode: "daily", grid: null };

const STUBBED = ["share", "canShare", "clipboard"] as const;

/** Gives the page's navigator the share and clipboard APIs a test wants. */
function stubNavigator(
  stubs: Partial<Record<(typeof STUBBED)[number], unknown>>,
): void {
  for (const [name, value] of Object.entries(stubs)) {
    Object.defineProperty(window.navigator, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

function log(): TrackedEvent[] {
  return (
    (window as unknown as { __qzTrackLog?: TrackedEvent[] }).__qzTrackLog ?? []
  );
}

function named(name: string): TrackedEvent[] {
  return log().filter((event) => event.name === name);
}

/** The confirmation drawn beside the button, not the status region's copy. */
function onScreen(text: string): HTMLElement | null {
  const button = document.querySelector<HTMLElement>("[data-share-button]");
  return button === null ? null : within(button).queryByText(text);
}

function status(): string {
  return document.getElementById(LIVE_REGION_IDS.polite)?.textContent ?? "";
}

/** Presses Share and lets the share's promise chain run out. */
async function press(): Promise<void> {
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: SHARE_BUTTON_COPY.share }),
    );
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  });
}

afterEach(() => {
  for (const name of STUBBED) {
    delete (window.navigator as unknown as Record<string, unknown>)[name];
  }
  delete (window as unknown as { __qzTrackLog?: unknown }).__qzTrackLog;
  document.getElementById(LIVE_REGION_IDS.polite)?.remove();
  vi.useRealTimers();
});

describe("the Share button (PRD §3.5.2, DESIGN §6.11)", () => {
  it("AC-SHR-04 counts one share_complete when Web Share resolves, after share_open", async () => {
    const share = vi.fn(async () => {});
    stubNavigator({ share });
    render(<ShareButton payload={PAYLOAD} surface="stop" />);
    await press();
    // The text alone, with the link as its last line (PRD §3.5.2).
    expect(share).toHaveBeenCalledWith({ text: TEXT });
    expect(log()).toEqual([
      { name: "share_open", props: { mode: "daily", surface: "stop" } },
      {
        name: "share_complete",
        props: { method: "native", mode: "daily", surface: "stop" },
      },
    ]);
  });

  it("AC-SHR-04 counts a share sheet closed with AbortError as share_cancel, never share_complete", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({
      share: vi.fn(async () => {
        throw new DOMException("Share canceled", "AbortError");
      }),
      clipboard: { writeText },
    });
    render(<ShareButton payload={PAYLOAD} surface="home" />);
    await press();
    expect(named("share_complete")).toEqual([]);
    expect(named("share_cancel")).toEqual([
      { name: "share_cancel", props: { mode: "daily", surface: "home" } },
    ]);
    // Closing the sheet is a choice: nothing is copied behind the player's back.
    expect(writeText).not.toHaveBeenCalled();
  });

  it("AC-SHR-05 copies with the clipboard when Web Share is absent and logs share_complete with method clipboard", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({ clipboard: { writeText } });
    render(<ShareButton payload={PAYLOAD} surface="stop" />);
    await press();
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(named("share_complete")).toEqual([
      {
        name: "share_complete",
        props: { method: "clipboard", mode: "daily", surface: "stop" },
      },
    ]);
    expect(status()).toBe("Copied. Paste it into your group chat.");
    expect(onScreen("Copied. Paste it into your group chat.")).toBeVisible();
  });

  it("R1-01 falls back to the clipboard when Web Share refuses for any other reason", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({
      share: vi.fn(async () => {
        throw new DOMException("Not allowed here", "NotAllowedError");
      }),
      clipboard: { writeText },
    });
    render(<ShareButton payload={PAYLOAD} surface="stop" />);
    await press();
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(named("share_complete")[0]?.props).toMatchObject({
      method: "clipboard",
    });
    expect(named("share_cancel")).toEqual([]);
  });

  it("R1-01 skips Web Share when the browser says it can't share text", async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    stubNavigator({ share, canShare: () => false, clipboard: { writeText } });
    render(<ShareButton payload={PAYLOAD} surface="stop" />);
    await press();
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it("R1-01 shows the text selected in a read-only box with 'Copy this text' when both fail, and counts the player's own copy once", async () => {
    stubNavigator({
      clipboard: {
        writeText: vi.fn(async () => {
          throw new DOMException("Denied", "NotAllowedError");
        }),
      },
    });
    render(<ShareButton payload={PAYLOAD} surface="stop" />);
    await press();
    const box = screen.getByRole("textbox", { name: "Copy this text" });
    expect(box).toHaveValue(TEXT);
    expect(box).toHaveAttribute("readonly");
    expect(box).toHaveFocus();
    const area = box as HTMLTextAreaElement;
    expect([area.selectionStart, area.selectionEnd]).toEqual([0, TEXT.length]);
    expect(named("share_complete")).toEqual([]);

    fireEvent.copy(box);
    fireEvent.copy(box);
    expect(named("share_complete")).toEqual([
      {
        name: "share_complete",
        props: { method: "manual", mode: "daily", surface: "stop" },
      },
    ]);
  });

  it("R1-01 treats a press while the share sheet is still open as nothing", async () => {
    let finish: () => void = () => {};
    const share = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    stubNavigator({ share });
    render(<ShareButton payload={PAYLOAD} surface="stop" />);
    await press();
    await press();
    expect(share).toHaveBeenCalledTimes(1);
    expect(named("share_open")).toHaveLength(1);
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(named("share_complete")).toHaveLength(1);
  });

  it("R1-01 takes the on-screen confirmation down after a toast's 4 seconds", async () => {
    vi.useFakeTimers();
    stubNavigator({ clipboard: { writeText: vi.fn(async () => {}) } });
    render(<ShareButton payload={PAYLOAD} surface="stop" />);
    await press();
    expect(onScreen("Copied. Paste it into your group chat.")).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(COPIED_MS);
    });
    expect(onScreen("Copied. Paste it into your group chat.")).toBeNull();
  });
});
