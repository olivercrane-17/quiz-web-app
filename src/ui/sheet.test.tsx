import { screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import { LIVE_REGION_IDS, announce } from "./announce";
import { Button } from "./button";
import { Sheet } from "./sheet";

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
});
