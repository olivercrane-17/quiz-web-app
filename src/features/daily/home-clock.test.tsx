/**
 * The running time on Today's Continue card (RITE round 4, R4-04): read
 * from the attempt, ticking on its own seconds, silent, and absent when
 * the stopwatch is hidden.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AttemptId, AttemptSnapshot } from "@/engine/types";

import { AwayTime, loadAwayClock } from "./home-clock";

const T0 = Date.UTC(2026, 10, 10, 9);
const ATTEMPT = "0f8fad5b-d9cb-469f-a165-70867728950e" as AttemptId;

const mocks = vi.hoisted(() => ({
  stopwatch: "shown" as "shown" | "hidden",
  get: vi.fn(),
}));

vi.mock("@/backend", () => ({
  getBackend: () => Promise.resolve({ sealed: { get: mocks.get } }),
}));
vi.mock("@/features/identity", () => ({
  bootClient: () => Promise.resolve(),
}));
vi.mock("@/platform/settings/store", () => ({
  getSettingsStore: () => ({ get: () => ({ stopwatch: mocks.stopwatch }) }),
}));
vi.mock("@/platform/server-clock", () => ({
  getServerClock: () => ({ now: () => Date.now() }),
  systemClock: { now: () => Date.now(), monotonic: () => Date.now() },
}));

const SNAPSHOT = {
  status: "active",
  resolved: [{ activeMs: 60_000 }],
  current: { index: 1, open: { issuedAt: T0 - 9_500 }, activeMs: 9_000 },
  serverTime: T0,
} as unknown as AttemptSnapshot;

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  mocks.stopwatch = "shown";
  mocks.get.mockReset().mockResolvedValue({ ok: true, value: SNAPSHOT });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loadAwayClock", () => {
  it("R4-04 reads the attempt and returns its clock as of now", async () => {
    await expect(loadAwayClock(ATTEMPT)).resolves.toEqual({
      resolvedMs: 60_000,
      openMs: 9_000,
      at: T0,
    });
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(ATTEMPT);
  });

  it("R4-04 with the stopwatch hidden, returns nothing and never reads the attempt", async () => {
    mocks.stopwatch = "hidden";
    await expect(loadAwayClock(ATTEMPT)).resolves.toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("R4-04 an attempt that can't be read, or whose round has closed, brings no time", async () => {
    mocks.get.mockResolvedValue({ ok: false, error: { code: "unreachable" } });
    await expect(loadAwayClock(ATTEMPT)).resolves.toBeNull();
    mocks.get.mockResolvedValue({
      ok: true,
      value: { ...SNAPSHOT, current: { index: 1, open: null } },
    });
    await expect(loadAwayClock(ATTEMPT)).resolves.toBeNull();
  });
});

describe("AwayTime", () => {
  const clock = { resolvedMs: 60_000, openMs: 9_400, at: T0 };

  it("R4-04 shows the time as the header would, named Time so far for screen readers", () => {
    const { container } = render(<AwayTime clock={clock} />);
    const time = container.querySelector("[data-daily-clock-time]");
    expect(time).toHaveTextContent(/^Time so far 1:09$/);
    expect(time?.querySelector(".sr-only")).toHaveTextContent("Time so far");
  });

  it("R4-04 ticks on its own whole seconds: three seconds on, it reads three seconds more", () => {
    const { container } = render(<AwayTime clock={clock} />);
    const time = () =>
      container.querySelector("[data-daily-clock-time]")?.lastChild
        ?.textContent;
    expect(time()).toBe("1:09");
    // 600 ms to the turn of its second, then a tick's slack.
    act(() => {
      vi.advanceTimersByTime(610);
    });
    expect(time()).toBe("1:10");
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(time()).toBe("1:12");
  });

  it("R4-04 is plain text: no live region, no timer role, nothing that speaks as it turns", () => {
    const { container } = render(<AwayTime clock={clock} />);
    expect(
      container.querySelector(
        "[aria-live], [role=status], [role=alert], [role=timer]",
      ),
    ).toBeNull();
  });

  it("R4-04 stops its timer when it leaves the page", () => {
    const { unmount } = render(<AwayTime clock={clock} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
