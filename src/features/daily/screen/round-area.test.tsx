/**
 * The round area around the round components, driven by the real
 * controller over the mock backend with the echo test plugins: labels and
 * the category chip, the withdrawn card (PRD §3.13.4) and its Continue,
 * and the registry's component for an open round. The family components
 * themselves are PRA-1's and MYS-1's.
 */
import { act, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore, createMockBackend } from "@/backend/mock";
import { voidRound } from "@/backend/mock/server/sealed";
import { createFakeClock } from "@/engine/clock";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import {
  parseEntityId,
  parseIdempotencyKey,
  parseTimeZone,
  type EntityId,
  type IdempotencyKey,
  type TimeZone,
} from "@/engine/types";
import { playSettingsFrom } from "@/features/rounds";
import { createLocalIdentityProvider } from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { DEFAULT_SETTINGS } from "@/platform/settings/store";
import { createKv, createMemoryStorage } from "@/platform/storage";
import { renderWithUser } from "@/test/render";

import {
  createDailyController,
  type DailyController,
} from "../model/controller";
import { RoundArea } from "./round-area";

/** 09:00 UTC on Sunday 1 November 2026: Daily #42 (m3e1). */
const NOV_1 = Date.UTC(2026, 10, 1, 9);
const ODILE = parseEntityId("fx.x.person.odile-marsh") as EntityId;
const SETTINGS = playSettingsFrom(DEFAULT_SETTINGS, true);

const controllers: DailyController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.stop();
});

function setup() {
  const clock = createFakeClock(NOV_1);
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
  const controller = createDailyController({
    backend: async () => mock,
    plugins: createEchoRegistry(),
    clock,
    schedule: (fn, ms) => {
      const timer = setTimeout(fn, ms);
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
  });
  controllers.push(controller);
  return { mock, controller };
}

function Screen({ controller }: { controller: DailyController }) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  if (snapshot.status !== "playing") return null;
  return (
    <RoundArea
      snapshot={snapshot}
      controller={controller}
      settings={SETTINGS}
    />
  );
}

describe("the Daily's round area", () => {
  it("labels the open round, renders it from the registry, and shows a withdrawn round's card with its Continue", async () => {
    const { mock, controller } = setup();
    await voidRound(mock.context, { dailyNumber: 42, round: 1 });
    const { user } = renderWithUser(<Screen controller={controller} />);
    act(() => {
      controller.start();
    });

    expect(
      await screen.findByRole("heading", { name: "Mystery 1 of 3 · Easy" }),
    ).toBeVisible();
    expect(screen.getByText("History")).toBeVisible();
    // The registry's Mystery component (MYS-1's stub on this branch).
    expect(
      document.querySelector('[data-round-placeholder="mystery"]'),
    ).not.toBeNull();

    // Solve Mystery 1, then Continue to Mystery 2, which was withdrawn.
    act(() => {
      controller.intent({ family: "mystery", kind: "guess", entityId: ODILE });
    });
    await vi.waitFor(() => {
      expect(controller.getSnapshot().view?.phase).toBe("revealed");
    });
    act(() => {
      controller.continue();
    });
    expect(
      await screen.findByRole("heading", {
        name: "This Mystery was withdrawn because we got it wrong. Everyone gets 4 points.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Mystery 2 of 3 · Medium" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next mystery" }));
    expect(
      await screen.findByRole("heading", { name: "Mystery 3 of 3 · Hard" }),
    ).toBeVisible();
    expect(
      document
        .querySelector("[data-round-area]")
        ?.getAttribute("data-round-index"),
    ).toBe("2");
  });
});
