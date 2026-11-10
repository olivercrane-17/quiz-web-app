/**
 * The Daily's stopwatch (PRD §3.1.3, DESIGN §6.7): silent, a button that
 * opens the More menu at Hide stopwatch (RITE round 1 R1-05), and picking
 * up after a reload from the server's figure (R1-06).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRun, reduceRun, type RunState } from "@/engine/run";
import { config, roundMeta } from "@/engine/run/testing";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";

import { Stopwatch, TICK_SLACK_MS, untilNextSecond } from "./stopwatch";

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

  it("R3-01 ticks on its own whole seconds, not the wall clock's, so it never reads behind the time counted", () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
      now: NOW,
    });
    // Opened 41.7 s before a whole wall-clock second.
    render(
      <Stopwatch
        run={openFor(41_700)}
        offset={null}
        expanded={false}
        menuId="more"
        onOpenMenu={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Time so far 0:41" }),
    ).toBeVisible();
    // 42.0 s counted, 300 ms on: round 3's wall-clock tick read 0:41 here
    // until the next wall second.
    act(() => {
      vi.advanceTimersByTime(300 + TICK_SLACK_MS);
    });
    expect(
      screen.getByRole("button", { name: "Time so far 0:42" }),
    ).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(
      screen.getByRole("button", { name: "Time so far 0:43" }),
    ).toBeVisible();
    expect(untilNextSecond(41_700)).toBe(300 + TICK_SLACK_MS);
    expect(untilNextSecond(42_000)).toBe(1_000 + TICK_SLACK_MS);
  });

  it("R3-01 stops when the answer is sent and holds that value while the server answers", () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
      now: NOW,
    });
    const sent = reduceRun(
      openFor(41_700),
      {
        type: "intent",
        at: NOW,
        key: "00000000-0000-4000-8000-000000000001" as never,
        intent: { family: "mystery", kind: "next_clue" },
      },
      createEchoRegistry(),
    ).state;
    render(
      <Stopwatch
        run={sent}
        offset={null}
        expanded={false}
        menuId="more"
        onOpenMenu={() => {}}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(
      screen.getByRole("button", { name: "Time so far 0:41" }),
    ).toBeVisible();
  });

  it("R3-01 a press between a counted second turning and its tick shows the new second at once, the value the round claims (round 4 review)", () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
      now: NOW,
    });
    const open = openFor(41_700);
    const { rerender } = render(
      <Stopwatch
        run={open}
        offset={null}
        expanded={false}
        menuId="more"
        onOpenMenu={() => {}}
      />,
    );
    // 42.002 s counted: the tick is due at 42.004 s (later still on a
    // throttled phone), so the header still reads the old second.
    act(() => {
      vi.advanceTimersByTime(302);
    });
    expect(
      screen.getByRole("button", { name: "Time so far 0:41" }),
    ).toBeVisible();
    // The press lands in that window: the header freezes at the press,
    // which already counts 42 s, so it steps to 0:42 with the press and
    // holds it, the whole second the claim (42.002 s) is recorded as. A
    // tester reads the header at least 100 ms before pressing (rite-3.md
    // §10, item 4) so the step can't be mistaken for a jump.
    const sent = reduceRun(
      open,
      {
        type: "intent",
        at: NOW + 302,
        key: "00000000-0000-4000-8000-000000000002" as never,
        intent: { family: "mystery", kind: "next_clue" },
      },
      createEchoRegistry(),
    ).state;
    rerender(
      <Stopwatch
        run={sent}
        offset={null}
        expanded={false}
        menuId="more"
        onOpenMenu={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Time so far 0:42" }),
    ).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(
      screen.getByRole("button", { name: "Time so far 0:42" }),
    ).toBeVisible();
  });
});
