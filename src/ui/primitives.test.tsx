import { act, screen, waitFor, within } from "@testing-library/react";
import { Activity, createRef, useState, type MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import { Banner } from "./banner";
import { Card, Ticket } from "./card";
import { Chip, chipClasses } from "./chip";
import { Dialog } from "./dialog";
import { Pips } from "./icons";
import { NewtMark } from "./newt-mark";
import { Num } from "./num";
import { ProgressSegments } from "./progress-segments";
import { SegmentedControl } from "./segmented-control";
import { Stopwatch } from "./stopwatch";

describe("Chip", () => {
  it("shows its word with an optional icon, in a tone", () => {
    renderWithUser(
      <Chip tone="correct" icon={<svg data-testid="icon" aria-hidden="true" />}>
        Bullseye
      </Chip>,
    );
    const chip = screen.getByText("Bullseye");
    expect(chip).toHaveAttribute("data-tone", "correct");
    expect(chip).toHaveClass("kn-chip");
    expect(within(chip).getByTestId("icon")).toBeInTheDocument();
  });

  it("gives a linked chip a 44 px hit area", () => {
    expect(chipClasses({ interactive: true })).toBe("kn-chip kn-hit");
    expect(chipClasses()).toBe("kn-chip");
  });
});

describe("Stopwatch", () => {
  it("reads its label before the time and never announces the ticks", () => {
    renderWithUser(<Stopwatch time="1:12" label="Time" />);
    const watch = screen.getByText("1:12", { exact: false });
    expect(watch).toHaveAttribute("aria-live", "off");
    expect(watch).toHaveTextContent("Time 1:12");
    expect(watch.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("is a button when it opens the More menu", async () => {
    const onClick = vi.fn();
    const { user } = renderWithUser(
      <Stopwatch time="0:07" label="Time" onClick={onClick} />,
    );
    await user.click(screen.getByRole("button", { name: "Time 0:07" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("R1-27 as the More menu's button, carries the menu's state and a ref for the Daily header", async () => {
    const opener = createRef<HTMLButtonElement>();
    // React clears `currentTarget` once the handler returns: note it there.
    let openedFrom: EventTarget | null = null;
    const onClick = vi.fn((event: MouseEvent<HTMLButtonElement>) => {
      openedFrom = event.currentTarget;
    });
    const { user } = renderWithUser(
      <>
        <Stopwatch
          ref={opener}
          time="1:12"
          label="Time so far"
          onClick={onClick}
          aria-haspopup="menu"
          aria-expanded
          aria-controls="more-menu"
          aria-describedby="watch-hint"
        />
        <p id="watch-hint">Take your time. Time only breaks ties.</p>
      </>,
    );
    const button = screen.getByRole("button", { name: "Time so far 1:12" });
    expect(opener.current).toBe(button);
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", "more-menu");
    expect(button).toHaveAccessibleDescription(
      "Take your time. Time only breaks ties.",
    );
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(openedFrom).toBe(button);
  });

  it("R3-09 leaves nothing behind in a hidden route, and comes back when the route shows", async () => {
    // Next hides a visited route in <Activity>: the results page kept the
    // Daily's "Time so far 6:33" in the document.
    function Route({ mode }: { mode: "visible" | "hidden" }) {
      return (
        <Activity mode={mode}>
          <Stopwatch time="6:33" label="Time so far" />
        </Activity>
      );
    }
    const { rerender } = renderWithUser(<Route mode="visible" />);
    expect(screen.getByText("6:33", { exact: false })).toHaveTextContent(
      "Time so far 6:33",
    );
    await act(async () => {
      rerender(<Route mode="hidden" />);
    });
    await waitFor(() => {
      expect(document.querySelector("[data-stopwatch]")).toBeNull();
    });
    expect(document.body).not.toHaveTextContent("Time so far");
    await act(async () => {
      rerender(<Route mode="visible" />);
    });
    expect(screen.getByText("6:33", { exact: false })).toBeVisible();
  });
});

function Difficulty() {
  const [value, setValue] = useState<"easy" | "medium" | "mixed">("mixed");
  return (
    <SegmentedControl
      legend="Difficulty"
      name="difficulty"
      value={value}
      onChange={setValue}
      options={[
        {
          value: "easy",
          label: (
            <>
              Easy
              <Pips level={1} />
            </>
          ),
        },
        {
          value: "medium",
          label: (
            <>
              Medium
              <Pips level={2} />
            </>
          ),
        },
        { value: "mixed", label: "Mixed" },
      ]}
    />
  );
}

describe("Pips", () => {
  it("inks the first dots of three for the level, hidden from screen readers", () => {
    const { container } = renderWithUser(
      <>
        <Pips level={1} />
        <Pips level={3} />
      </>,
    );
    const [easy, hard] = container.querySelectorAll("svg");
    expect(easy).toHaveAttribute("aria-hidden", "true");
    const fills = (svg: Element | undefined) =>
      [...(svg?.querySelectorAll("circle") ?? [])].map((dot) =>
        dot.getAttribute("fill"),
      );
    expect(fills(easy)).toEqual(["currentColor", "none", "none"]);
    expect(fills(hard)).toEqual([
      "currentColor",
      "currentColor",
      "currentColor",
    ]);
  });
});

describe("SegmentedControl", () => {
  it("is a named group of radios with one checked", () => {
    renderWithUser(<Difficulty />);
    const group = screen.getByRole("group", { name: "Difficulty" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual([
      "easy",
      "medium",
      "mixed",
    ]);
    expect(screen.getByRole("radio", { name: "Mixed" })).toBeChecked();
  });

  it("moves the choice by pointer and by arrow keys", async () => {
    const { user } = renderWithUser(<Difficulty />);
    await user.click(screen.getByText("Easy"));
    expect(screen.getByRole("radio", { name: "Easy" })).toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Medium" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Easy" })).not.toBeChecked();
  });

  it("can keep its legend for screen readers only", () => {
    renderWithUser(
      <SegmentedControl
        legend="Difficulty"
        hideLegend
        name="d"
        value="a"
        onChange={() => {}}
        options={[{ value: "a", label: "A" }]}
      />,
    );
    expect(screen.getByText("Difficulty")).toHaveClass("sr-only");
  });
});

describe("Banner", () => {
  it("shows its lead-in, text and icon, in a tone", () => {
    const { container } = renderWithUser(
      <Banner title="You're offline.">
        Practice works, but it isn&apos;t today&apos;s Daily.
      </Banner>,
    );
    const banner = container.querySelector("[data-banner]");
    expect(banner).toHaveAttribute("data-tone", "neutral");
    expect(banner).not.toHaveAttribute("data-overlay");
    expect(banner).toHaveTextContent(
      "You're offline. Practice works, but it isn't today's Daily.",
    );
    expect(banner?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("dismisses through a named button, and overlays when late", async () => {
    const onDismiss = vi.fn();
    const { user, container } = renderWithUser(
      <Banner
        tone="caution"
        overlay
        onDismiss={onDismiss}
        dismissLabel="Hide for an hour"
      >
        We&apos;re having trouble on our side.
      </Banner>,
    );
    expect(container.querySelector("[data-banner]")).toHaveAttribute(
      "data-overlay",
    );
    await user.click(screen.getByRole("button", { name: "Hide for an hour" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("Dialog", () => {
  it("is the modal sheet: a dialog named by its title, closed by Escape", async () => {
    const onClose = vi.fn();
    const { user } = renderWithUser(
      <Dialog open title="How old are you?" onClose={onClose}>
        <button type="button">18 or over</button>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "How old are you?" });
    expect(dialog).toHaveAttribute("data-sheet", "modal");
    expect(dialog).toHaveClass("kn-dialog");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("Card and Ticket", () => {
  it("Card carries its tone and padding", () => {
    renderWithUser(
      <Card tone="sunken" padded={false} data-testid="card">
        Well
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card).toHaveAttribute("data-tone", "sunken");
    expect(card).toHaveClass("kn-card");
    expect(card).not.toHaveClass("kn-card-pad");
  });

  it("Ticket puts its body above the tear and its stub below", () => {
    renderWithUser(
      <Ticket aria-label="Today's Daily" stub={<a href="/daily">Play</a>}>
        <h2>Three Mysteries and an Encore</h2>
      </Ticket>,
    );
    const ticket = screen.getByRole("region", { name: "Today's Daily" });
    const [body, stub] = [...ticket.children];
    expect(body).toHaveClass("kn-ticket-body");
    expect(body).toHaveTextContent("Three Mysteries and an Encore");
    expect(stub).toHaveClass("kn-ticket-stub");
    expect(
      within(stub as HTMLElement).getByRole("link", { name: "Play" }),
    ).toBeVisible();
  });

  it("a Ticket without a stub is one piece", () => {
    const { container } = renderWithUser(<Ticket>Join on your phone</Ticket>);
    expect(container.querySelector(".kn-ticket-stub")).toBeNull();
  });
});

describe("NewtMark", () => {
  it("is decorative, at the detail level DESIGN gives its size", () => {
    const { container } = renderWithUser(
      <>
        <NewtMark size={16} />
        <NewtMark size={36} />
        <NewtMark size={64} />
      </>,
    );
    const marks = [...container.querySelectorAll("svg")];
    expect(marks.map((mark) => mark.getAttribute("data-detail"))).toEqual([
      "small",
      "mid",
      "full",
    ]);
    for (const mark of marks)
      expect(mark).toHaveAttribute("aria-hidden", "true");
    // The small mark reads as a plain "?": no legs, no eyes.
    expect(marks[0]?.querySelector(".kn-mark-legs")).toBeNull();
    expect(marks[1]?.querySelectorAll(".kn-mark-eye")).toHaveLength(2);
  });
});

describe("Num", () => {
  it("sets a numeral in the display face", () => {
    renderWithUser(<Num>4,812</Num>);
    expect(screen.getByText("4,812")).toHaveClass("kn-num");
  });
});

describe("ProgressSegments italic marks", () => {
  it("sets a step's mark in italic when asked, as the Encore's E", () => {
    renderWithUser(
      <ProgressSegments
        label="Daily progress"
        segments={[
          { status: "upcoming", current: true, mark: "1", label: "Mystery 1" },
          { status: "upcoming", mark: "E", italic: true, label: "Encore" },
        ]}
      />,
    );
    const [first, encore] = screen.getAllByRole("listitem");
    expect(first).not.toHaveAttribute("data-italic");
    expect(encore).toHaveAttribute("data-italic");
    expect(encore).toHaveClass("kn-step");
  });
});
