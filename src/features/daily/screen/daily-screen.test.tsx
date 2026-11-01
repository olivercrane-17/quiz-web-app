/**
 * The Daily screen's start problems (PRD §3.0.2, AC-IDN-04): what each
 * refusal says, and when Practice is offered. The controller decides when a
 * rate-limited start moves from silent to plain copy to the fallback
 * (controller.test.ts); this is what the screen draws for each.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BackendErrorCode } from "@/engine/types";

import type {
  DailyController,
  DailySnapshot,
  StartProblem,
} from "../model/controller";
import { StartProblemCard } from "./daily-screen";

const NOW = Date.UTC(2026, 10, 1, 9);

function problem(overrides: Partial<StartProblem>): StartProblem {
  return {
    code: "rate_limited" as BackendErrorCode,
    count: 6,
    retrying: true,
    refId: null,
    since: NOW,
    scope: "ip",
    retryAfterMs: 1000,
    notice: "plain",
    ...overrides,
  };
}

function show(value: StartProblem) {
  const retry = vi.fn();
  const controller = { retry } as unknown as DailyController;
  const snapshot = {
    status: value.retrying ? "starting" : "failed",
    problem: value,
  } as unknown as DailySnapshot;
  render(<StartProblemCard snapshot={snapshot} controller={controller} />);
  return { retry };
}

describe("a start that can't go through", () => {
  it("AC-IDN-04 names the network after 5 s of refusals, with Try again and no Practice yet", () => {
    show(problem({ scope: "ip", notice: "plain" }));
    expect(
      screen.getByRole("heading", {
        name: "Lots of new players on your network right now. Trying again…",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Play practice instead" }),
    ).toBeNull();
  });

  it("AC-IDN-04 says so without the network when the project-wide ceiling refused it", () => {
    show(problem({ scope: "project", notice: "plain" }));
    expect(
      screen.getByRole("heading", {
        name: "Lots of new players right now. Trying again…",
      }),
    ).toBeVisible();
  });

  it("AC-IDN-04 offers Practice from 30 s of refusals", () => {
    show(problem({ notice: "fallback" }));
    expect(
      screen.getByRole("heading", {
        name: "We couldn't set up your profile right now.",
      }),
    ).toBeVisible();
    expect(screen.getByText("Practice still works.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Play practice instead" }),
    ).toHaveAttribute("href", "/practice/run");
  });

  it("keeps the unreachable copy, with Practice at once", () => {
    const { retry } = show(
      problem({ code: "unreachable", scope: null, notice: "plain" }),
    );
    expect(
      screen.getByRole("heading", { name: "We couldn't reach today's Daily." }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Play practice instead" }),
    ).toHaveAttribute("href", "/practice/run");
    screen.getByRole("button", { name: "Try again" }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
