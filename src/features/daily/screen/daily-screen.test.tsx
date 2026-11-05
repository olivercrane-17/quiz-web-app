/**
 * The Daily screen's start problems (PRD §3.0.2, AC-IDN-04): what each
 * refusal says, and when Practice is offered. The controller decides when a
 * rate-limited start moves from silent to plain copy to the fallback
 * (controller.test.ts); this is what the screen draws for each.
 *
 * Then the whole screen over the mock backend, with the echo plugins and
 * probes for the round components: the first-Daily hint as the stopwatch's
 * accessible description (RITE round 1, R1-05).
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore, createMockBackend } from "@/backend/mock";
import { createFakeClock } from "@/engine/clock";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import {
  parseIdempotencyKey,
  parseTimeZone,
  type BackendErrorCode,
  type IdempotencyKey,
  type TimeZone,
} from "@/engine/types";
import type { RoundComponentProps } from "@/features/rounds";
import { createLocalIdentityProvider } from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { createKv, createMemoryStorage } from "@/platform/storage";

import type {
  DailyController,
  DailyControllerDeps,
  DailySnapshot,
  StartProblem,
} from "../model/controller";
import { DailyScreen, StartProblemCard } from "./daily-screen";

const wiring = vi.hoisted(() => ({
  deps: null as DailyControllerDeps | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, prefetch: () => {} }),
}));
vi.mock("../model/browser", () => ({
  browserDeps: () => {
    if (wiring.deps === null) throw new Error("no controller deps");
    return wiring.deps;
  },
}));
// The round components are MYS-1's: a probe stands in for each family.
vi.mock(import("@/features/rounds/client"), async (importOriginal) => {
  const probe = (family: string) =>
    function Probe(props: RoundComponentProps) {
      return <h1 data-probe={family}>{props.meta.type}</h1>;
    };
  return {
    ...(await importOriginal()),
    ROUND_COMPONENTS: {
      choice: probe("choice"),
      mystery: probe("mystery"),
      encore: probe("encore"),
    },
  };
});

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
    ).toHaveAttribute("href", "/practice");
  });

  it("says the Daily isn't ready yet when the backend serves none, never 'on this server', with Practice and no Try again", () => {
    show(problem({ code: "unavailable", retrying: false, scope: null }));
    expect(
      screen.getByRole("heading", { name: "Today's Daily isn't ready yet." }),
    ).toBeVisible();
    expect(screen.getByText("Practice is ready when you are.")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/on this server/);
    expect(
      screen.getByRole("link", { name: "Play practice instead" }),
    ).toHaveAttribute("href", "/practice");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("AC-DLY-10 a device with no connection gets the offline state, whatever the backend answered, with Try again and Practice", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      for (const code of ["unavailable", "unreachable", "internal"] as const) {
        cleanup();
        show(problem({ code, retrying: false, scope: null }));
        const card = document.querySelector("[data-daily-problem]");
        expect(card, code).toHaveAttribute("data-daily-problem", "offline");
        expect(
          screen.getByRole("heading", {
            name: "The Daily needs a connection.",
          }),
        ).toBeVisible();
        expect(
          screen.getByText(
            "Practice works offline, but it isn't today's Daily.",
          ),
        ).toBeVisible();
        expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
        expect(
          screen.getByRole("link", { name: "Play practice instead" }),
        ).toHaveAttribute("href", "/practice");
      }
      // Back online, the card says what the backend said.
      onLine.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      expect(
        screen.getByRole("heading", {
          name: "Something went wrong with today's Daily.",
        }),
      ).toBeVisible();
    } finally {
      onLine.mockRestore();
    }
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
    ).toHaveAttribute("href", "/practice");
    screen.getByRole("button", { name: "Try again" }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

const HINT = "Take your time. Time only breaks ties.";
const DAY_MS = 24 * 60 * 60 * 1000;

/** A mock backend on a fake clock at `at`, with the echo plugins. */
function wire(at: number) {
  const clock = createFakeClock(at);
  const identity = createLocalIdentityProvider({
    kv: createKv({ storage: createMemoryStorage() }),
    now: () => clock.now(),
  });
  const mock = createMockBackend(
    {
      identity: () => identity,
      serverClock: createServerClock({ base: clock }),
    },
    {
      store: createMemoryStore(),
      clock,
      init: { latencyMs: 0 },
      attachControls: false,
      plugins: createEchoRegistry(),
    },
  );
  let keys = 0;
  wiring.deps = {
    backend: async () => mock,
    plugins: createEchoRegistry(),
    clock,
    schedule(callback, ms) {
      const timer = setTimeout(callback, ms);
      return () => {
        clearTimeout(timer);
      };
    },
    random: () => 0.5,
    newKey: () => {
      keys += 1;
      return parseIdempotencyKey(
        `00000000-0000-4000-8000-${keys.toString(16).padStart(12, "0")}`,
      ) as IdempotencyKey;
    },
    announce: () => {},
    startContext: () => ({
      tz: parseTimeZone("UTC") as TimeZone,
      browser: { context: "browser", app: "none", platform: "desktop" },
      appVersion: "test",
    }),
  };
  return { mock, clock };
}

/** Mounts the screen and waits for the first round's stopwatch. */
async function playing(): Promise<HTMLElement> {
  render(<DailyScreen />);
  return act(() => screen.findByRole("button", { name: /^Time so far/ }));
}

describe("the first-Daily hint beside the stopwatch (R1-05)", () => {
  afterEach(() => {
    wiring.deps = null;
  });

  it("R1-05 in a first Daily, is the stopwatch's accessible description", async () => {
    wire(NOW);
    const watch = await playing();
    expect(screen.getByText(HINT)).toBeVisible();
    expect(watch).toHaveAccessibleDescription(HINT);
  });

  it("R1-05 once a Daily is finished, neither shows nor describes the stopwatch", async () => {
    const { mock, clock } = wire(NOW);
    await mock.controls.seed("finished_today");
    clock.advance(DAY_MS);
    const watch = await playing();
    expect(screen.queryByText(HINT)).toBeNull();
    expect(watch).not.toHaveAttribute("aria-describedby");
    expect(watch).toHaveAccessibleDescription("");
  });
});
