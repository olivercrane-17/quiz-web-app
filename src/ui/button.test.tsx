import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import { Button } from "./button";
import { BUTTON_VARIANTS, buttonClasses } from "./button-classes";

afterEach(() => {
  vi.useRealTimers();
});

describe("Button", () => {
  it("is a type=button control named by its label", async () => {
    const onClick = vi.fn();
    const { user } = renderWithUser(
      <Button variant="primary" onClick={onClick}>
        Lock in
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Lock in" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("data-variant", "primary");
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows the pressed look from pointerdown until release", async () => {
    const { user } = renderWithUser(<Button>Share</Button>);
    const button = screen.getByRole("button", { name: "Share" });
    await user.pointer({ keys: "[MouseLeft>]", target: button });
    expect(button).toHaveAttribute("data-pressed");
    await user.pointer({ keys: "[/MouseLeft]", target: button });
    expect(button).not.toHaveAttribute("data-pressed");
  });

  it("keeps the caller's pointer handlers", () => {
    const onPointerDown = vi.fn();
    renderWithUser(<Button onPointerDown={onPointerDown}>Play</Button>);
    fireEvent.pointerDown(screen.getByRole("button"), { button: 0 });
    expect(onPointerDown).toHaveBeenCalledOnce();
  });

  it("disabled leaves the tab order", async () => {
    const onClick = vi.fn();
    const { user } = renderWithUser(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    await user.tab();
    expect(button).not.toHaveFocus();
  });

  it("focusableWhenDisabled stays reachable with aria-disabled and ignores presses", async () => {
    const onClick = vi.fn();
    const { user } = renderWithUser(
      <Button disabled focusableWhenDisabled onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("data-disabled");
    await user.tab();
    expect(button).toHaveFocus();
    await user.click(button);
    await user.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { button: 0 });
    expect(button).not.toHaveAttribute("data-pressed");
  });

  it("busy keeps the label, adds a spinner, sets aria-busy and ignores presses", async () => {
    const onClick = vi.fn();
    const { user } = renderWithUser(
      <Button busy onClick={onClick}>
        Guess
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Guess" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    // Busy is not disabled: it keeps its look.
    expect(button).not.toHaveAttribute("data-disabled");
    expect(button.querySelector("svg")).not.toBeNull();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("says Checking… after 1.5 s of busy, and the label returns after", () => {
    vi.useFakeTimers();
    const { rerender } = renderWithUser(<Button busy>Lock in</Button>);
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(screen.getByRole("button")).toHaveAccessibleName("Lock in");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button")).toHaveAccessibleName("Checking…");

    rerender(<Button>Lock in</Button>);
    expect(screen.getByRole("button")).toHaveAccessibleName("Lock in");
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");

    // A new busy spell starts its own 1.5 s.
    rerender(<Button busy>Lock in</Button>);
    expect(screen.getByRole("button")).toHaveAccessibleName("Lock in");
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("button")).toHaveAccessibleName("Checking…");
  });

  it("styles links the same way through buttonClasses", () => {
    for (const variant of BUTTON_VARIANTS) {
      expect(buttonClasses({ variant })).toMatch(/\S/);
    }
    expect(buttonClasses({ variant: "primary", block: true })).toContain(
      "w-full",
    );
  });
});
