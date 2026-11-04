import { act, fireEvent, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import { LIVE_REGION_IDS, announce } from "./announce";
import { Button } from "./button";
import { Sheet, dragDismissDistance } from "./sheet";

function ReportFlow({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Report a problem
      </Button>
      <Sheet
        open={open}
        title="What's wrong?"
        description="Pick the closest reason."
        initialFocusRef={noteRef}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        actions={<Button variant="primary">Send report</Button>}
      >
        <textarea ref={noteRef} aria-label="Anything to add?" />
      </Sheet>
    </>
  );
}

describe("Sheet (modal)", () => {
  it("renders nothing until opened", () => {
    renderWithUser(<ReportFlow />);
    expect(screen.queryByRole("heading", { name: "What's wrong?" })).toBeNull();
  });

  it("opens as a dialog named by its title and described by its text", async () => {
    const { user } = renderWithUser(<ReportFlow />);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    const dialog = screen.getByRole("dialog", { name: "What's wrong?" });
    expect(dialog).toHaveAccessibleDescription("Pick the closest reason.");
    expect(dialog).toHaveAttribute("open");
    expect(
      screen.getByRole("button", { name: "Send report" }),
    ).toBeInTheDocument();
  });

  it("moves focus in on open and back to the opener on close", async () => {
    const onClose = vi.fn();
    const { user } = renderWithUser(<ReportFlow onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Report a problem" });
    await user.click(opener);
    expect(
      screen.getByRole("textbox", { name: "Anything to add?" }),
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const { user } = renderWithUser(<ReportFlow onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("without onClose it has no close button and ignores Escape", async () => {
    const { user } = renderWithUser(
      <Sheet open title="How old are you?">
        <Button>13 to 17</Button>
      </Sheet>,
    );
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    // The first control takes focus when nothing else is asked for.
    expect(screen.getByRole("button", { name: "13 to 17" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: "How old are you?" }),
    ).toBeInTheDocument();
  });

  it("reopens a sheet that must be answered when the browser closes it anyway", () => {
    // jsdom has no showModal(); stand in for Chromium, whose cancel stops
    // being cancelable after repeated Escapes and closes the dialog.
    const proto = HTMLDialogElement.prototype as unknown as Record<
      string,
      unknown
    >;
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    proto.showModal = showModal;
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
    try {
      renderWithUser(
        <Sheet open title="How old are you?">
          <Button>13 to 17</Button>
        </Sheet>,
      );
      const dialog = screen.getByRole<HTMLDialogElement>("dialog", {
        name: "How old are you?",
      });
      expect(showModal).toHaveBeenCalledOnce();
      dialog.close();
      expect(dialog).toHaveAttribute("open");
      expect(showModal).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("button", { name: "13 to 17" }),
      ).toBeInTheDocument();
    } finally {
      delete proto.showModal;
      delete proto.close;
    }
  });

  it("carries its own live regions, which announce() uses while it is open", async () => {
    const { user } = renderWithUser(<ReportFlow />);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    const dialog = screen.getByRole("dialog", { name: "What's wrong?" });
    announce("That name isn't allowed. Try another.");
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "That name isn't allowed. Try another.",
    );
    expect(document.getElementById(LIVE_REGION_IDS.polite)).toBeNull();
    announce("Can't send right now.", "assertive");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Can't send right now.",
    );

    // Closed: the page's own pair takes messages again.
    await user.click(screen.getByRole("button", { name: "Close" }));
    announce("Report sent. Thanks.");
    expect(document.getElementById(LIVE_REGION_IDS.polite)).toHaveTextContent(
      "Report sent. Thanks.",
    );
  });
});

describe("Sheet (inline)", () => {
  it("is a labelled region with a focusable title, rendered only while open", () => {
    const { rerender } = renderWithUser(
      <Sheet modal={false} open={false} title="It's Uranus.">
        <p>The only planet named after a Greek god.</p>
      </Sheet>,
    );
    expect(screen.queryByRole("region")).toBeNull();

    rerender(
      <Sheet
        modal={false}
        open
        title="It's Uranus."
        actions={<Button variant="primary">Continue</Button>}
      >
        <p>The only planet named after a Greek god.</p>
      </Sheet>,
    );
    const region = screen.getByRole("region", { name: "It's Uranus." });
    expect(region).toHaveAttribute("data-sheet", "inline");
    expect(
      screen.getByRole("heading", { name: "It's Uranus." }),
    ).toHaveAttribute("tabindex", "-1");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
  });

  it("rises when it opens by itself, and is there at once when the player's press opens it", async () => {
    const sheet = (open: boolean) => (
      <Sheet modal={false} open={open} title="It's Uranus." />
    );
    // Opening by itself, as the reveal's 1.2 s beat opens it.
    const first = renderWithUser(sheet(false));
    first.rerender(sheet(true));
    expect(screen.getByRole("region")).toHaveAttribute("data-arrival", "rise");
    first.unmount();

    // Opened from a press's own handler: the tap that completes the
    // automatic part at once (DESIGN §7.3).
    const second = renderWithUser(sheet(false));
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
      second.rerender(sheet(true));
    });
    expect(screen.getByRole("region")).toHaveAttribute(
      "data-arrival",
      "instant",
    );
    second.unmount();
    // The press is over once its task is.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Open from the start (a reload): simply there.
    renderWithUser(sheet(true));
    expect(screen.getByRole("region")).toHaveAttribute(
      "data-arrival",
      "instant",
    );
  });

  it("hands its title to titleRef for focus moves", () => {
    let heading: HTMLHeadingElement | null = null;
    renderWithUser(
      <Sheet
        modal={false}
        open
        title="It's Uranus."
        titleRef={(node) => {
          heading = node;
        }}
      />,
    );
    expect(heading).toBe(screen.getByRole("heading", { name: "It's Uranus." }));
  });

  it("R1-36 shows no grab handle: nothing drags the explanation sheet away", () => {
    renderWithUser(<Sheet modal={false} open title="It's Uranus." />);
    expect(
      screen.getByRole("region").querySelector("[data-sheet-grab]"),
    ).toBeNull();
  });
});

describe("the grab handle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * A drag on the handle, by pointer events, from y 100 to `100 + distance`
   * in four moves `msPerStep` apart (on a fake `performance` clock).
   */
  function drag(
    handle: Element,
    distance: number,
    { msPerStep = 40, cancel = false } = {},
  ) {
    vi.useFakeTimers({ toFake: ["performance"] });
    const at = (y: number) => ({ pointerId: 7, button: 0, clientY: y });
    fireEvent.pointerDown(handle, at(100));
    const steps = 4;
    for (let step = 1; step <= steps; step += 1) {
      vi.advanceTimersByTime(msPerStep);
      fireEvent.pointerMove(handle, at(100 + (distance * step) / steps));
    }
    if (cancel) fireEvent.pointerCancel(handle, at(100 + distance));
    else fireEvent.pointerUp(handle, at(100 + distance));
    vi.useRealTimers();
  }

  it("R1-36 drags a dismissible sheet down and closes it past a third of its height", async () => {
    const onClose = vi.fn();
    const { user } = renderWithUser(<ReportFlow onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    const dialog = screen.getByRole("dialog");
    const handle = dialog.querySelector("[data-sheet-grab]");
    if (handle === null) throw new Error("no grab handle");
    // Decorative for screen readers: the close button does the same.
    expect(handle).toHaveAttribute("aria-hidden", "true");

    // The sheet follows the finger, without its transition.
    fireEvent.pointerDown(handle, { pointerId: 7, button: 0, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientY: 140 });
    expect(dialog.style.translate).toBe("0 40px");
    expect(dialog).toHaveAttribute("data-dragging");
    // Never above its place.
    fireEvent.pointerMove(handle, { pointerId: 7, clientY: 60 });
    expect(dialog.style.translate).toBe("");
    fireEvent.pointerUp(handle, { pointerId: 7, clientY: 60 });

    drag(handle, 160, { msPerStep: 400 });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("R1-36 springs back from a short, slow drag, or a cancelled one", async () => {
    const onClose = vi.fn();
    const { user } = renderWithUser(<ReportFlow onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    const dialog = screen.getByRole("dialog");
    const handle = dialog.querySelector("[data-sheet-grab]");
    if (handle === null) throw new Error("no grab handle");

    drag(handle, 30, { msPerStep: 400 });
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.style.translate).toBe("");
    expect(dialog).not.toHaveAttribute("data-dragging");

    drag(handle, 200, { cancel: true });
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.style.translate).toBe("");
  });

  it("R1-36 a quick downward flick closes it however short", async () => {
    const onClose = vi.fn();
    const { user } = renderWithUser(<ReportFlow onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    const handle = screen
      .getByRole("dialog")
      .querySelector("[data-sheet-grab]");
    if (handle === null) throw new Error("no grab handle");
    // 40 px in 4 steps of 10 ms: 1 px a millisecond.
    drag(handle, 40, { msPerStep: 10 });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("R1-36 a sheet that must be answered has no handle to drag", async () => {
    function MustAnswer() {
      return (
        <Sheet
          open
          title="How old are you?"
          actions={<Button>13 to 17</Button>}
        />
      );
    }
    renderWithUser(<MustAnswer />);
    expect(
      screen.getByRole("dialog").querySelector("[data-sheet-grab]"),
    ).toBeNull();
  });

  it("closes past a third of the sheet, never more than 120 px and never under 48 px", () => {
    expect(dragDismissDistance(300)).toBe(100);
    expect(dragDismissDistance(900)).toBe(120);
    expect(dragDismissDistance(0)).toBe(48);
  });
});
