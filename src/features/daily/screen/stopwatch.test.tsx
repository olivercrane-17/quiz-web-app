/**
 * The Daily's stopwatch (PRD §3.1.3, DESIGN §6.7): silent, a button that
 * opens the More menu at Hide stopwatch (RITE round 1 R1-05), and picking
 * up after a reload from the server's figure (R1-06).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRun, reduceRun, type RunState } from "@/engine/run";
import { config, roundMeta } from "@/engine/run/testing";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";

import { Stopwatch } from "./stopwatch";

const NOW = Date.UTC(2026, 10, 1, 9);

/** A one-Mystery Daily whose round opened `ago` ms before NOW. */
function openFor(ago: number): RunState {
  const state = createRun(
    config([roundMeta(0, "mystery")], { mode: "daily", sealed: true }),
    NOW - ago,
  ).state;
  return reduceRun(
    state,
    {
      type: "opened",
      at: NOW - ago,
      index: 0,
      open: {
        family: "mystery",
        index: 0,
        clue: 1,
        clues: ["c1"],
        wrongGuesses: [],
        options: null,
        issuedAt: NOW - ago,
      },
    },
    createEchoRegistry(),
  ).state;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the stopwatch", () => {
  it("AC-DLY-12 never speaks as it ticks, and its name says what it counts", () => {
    render(
      <Stopwatch
        run={openFor(42_000)}
        offset={null}
        expanded={false}
        menuId="more"
        onOpenMenu={() => {}}
      />,
    );
    const watch = screen.getByRole("button", { name: "Time so far 0:42" });
    expect(watch).toHaveAttribute("aria-live", "off");
    expect(watch).toHaveAttribute("data-stopwatch");
  });

  it("R1-05 opens the More menu, as a menu button that says when it is open", () => {
    const onOpenMenu = vi.fn();
    const { rerender } = render(
      <Stopwatch
        run={openFor(0)}
        offset={null}
        expanded={false}
        menuId="more"
        onOpenMenu={onOpenMenu}
      />,
    );
    const watch = screen.getByRole("button", { name: /Time so far/ });
    expect(watch).toHaveAttribute("aria-haspopup", "menu");
    expect(watch).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(watch);
    expect(onOpenMenu).toHaveBeenCalledWith(watch);
    rerender(
      <Stopwatch
        run={openFor(0)}
        offset={null}
        expanded
        menuId="more"
        onOpenMenu={onOpenMenu}
      />,
    );
    expect(watch).toHaveAttribute("aria-expanded", "true");
    expect(watch).toHaveAttribute("aria-controls", "more");
  });

  it("R1-06 adds the time the round had before the reload", () => {
    render(
      <Stopwatch
        run={openFor(30_000)}
        offset={{ index: 0, ms: 90_000 }}
        expanded={false}
        menuId="more"
        onOpenMenu={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Time so far 2:00" }),
    ).toBeVisible();
  });
});
