import { screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

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
