/**
 * The Daily header's More menu (DESIGN §6.13, RITE round 1 R1-04 and
 * R1-05): ARIA's menu button pattern, with the screen's state in a small
 * harness, as DailyScreen keeps it.
 */
import { act, fireEvent, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "@/test/render";

import { MoreMenu, type MoreMenuItem } from "./more-menu";

function Harness({
  onHowToPlay = () => {},
  onToggleStopwatch = () => {},
  stopwatchShown = true,
}: {
  onHowToPlay?: () => void;
  onToggleStopwatch?: () => void;
  stopwatchShown?: boolean;
}) {
  const [openAt, setOpenAt] = useState<MoreMenuItem | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  return (
    <>
      <button type="button" data-stopwatch="">
        0:42
      </button>
      <MoreMenu
        openAt={openAt}
        fromButton
        onOpen={(at, element) => {
          opener.current = element;
          setOpenAt(at);
        }}
        onClose={(restore) => {
          setOpenAt(null);
          if (restore) opener.current?.focus();
        }}
        stopwatchShown={stopwatchShown}
        onHowToPlay={() => {
          setOpenAt(null);
          onHowToPlay();
        }}
        onToggleStopwatch={() => {
          setOpenAt(null);
          onToggleStopwatch();
        }}
        menuId="more-menu"
      />
      <p>Clue 1: something to read.</p>
    </>
  );
}

const more = () => screen.getByRole("button", { name: "More" });
const items = () => screen.getAllByRole("menuitem").map((i) => i.textContent);

describe("the More menu", () => {
  it("R1-04 opens on a press at How to play, with Hide stopwatch below it, and says it is open", async () => {
    const { user } = renderWithUser(<Harness />);
    expect(more()).toHaveAttribute("aria-haspopup", "menu");
    expect(more()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(more());
    const menu = screen.getByRole("menu", { name: "More" });
    expect(more()).toHaveAttribute("aria-expanded", "true");
    expect(more()).toHaveAttribute("aria-controls", menu.id);
    expect(items()).toEqual(["How to play", "Hide stopwatch"]);
    expect(screen.getByRole("menuitem", { name: "How to play" })).toHaveFocus();
  });

  it("R1-05 offers Show stopwatch once the stopwatch is hidden", async () => {
    const { user } = renderWithUser(<Harness stopwatchShown={false} />);
    await user.click(more());
    expect(items()).toEqual(["How to play", "Show stopwatch"]);
  });

  it("moves with the arrow keys, wrapping, and jumps with Home and End", async () => {
    const { user } = renderWithUser(<Harness />);
    more().focus();
    await user.keyboard("{ArrowDown}");
    const howToPlay = screen.getByRole("menuitem", { name: "How to play" });
    const hide = screen.getByRole("menuitem", { name: "Hide stopwatch" });
    expect(howToPlay).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(hide).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(howToPlay).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(hide).toHaveFocus();
    await user.keyboard("{Home}");
    expect(howToPlay).toHaveFocus();
    await user.keyboard("{End}");
    expect(hide).toHaveFocus();
  });

  it("opens at the last item with ArrowUp on the button", async () => {
    const { user } = renderWithUser(<Harness />);
    more().focus();
    await user.keyboard("{ArrowUp}");
    expect(
      screen.getByRole("menuitem", { name: "Hide stopwatch" }),
    ).toHaveFocus();
  });

  it("closes on Escape back to the button, and on Tab without stealing focus back", async () => {
    const { user } = renderWithUser(<Harness />);
    await user.click(more());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(more()).toHaveFocus();

    await user.click(more());
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(more()).not.toHaveFocus();
  });

  it("closes on a press outside it, but not on the stopwatch, which opens it too", async () => {
    renderWithUser(<Harness />);
    act(() => {
      fireEvent.click(more());
    });
    fireEvent.pointerDown(screen.getByRole("button", { name: "0:42" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText("Clue 1: something to read."));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("R1-04 runs How to play and the stopwatch toggle from their items", async () => {
    const onHowToPlay = vi.fn();
    const onToggleStopwatch = vi.fn();
    const { user } = renderWithUser(
      <Harness
        onHowToPlay={onHowToPlay}
        onToggleStopwatch={onToggleStopwatch}
      />,
    );
    await user.click(more());
    await user.click(screen.getByRole("menuitem", { name: "How to play" }));
    expect(onHowToPlay).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(more());
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onToggleStopwatch).toHaveBeenCalledTimes(1);
  });
});
