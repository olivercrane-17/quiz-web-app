/**
 * The round area around the round components, driven by the real
 * controller over the mock backend with the echo test plugins and a manual
 * clock: what the area draws itself (the label and chip only where no round
 * component is mounted, the withdrawn and resumed cards, the opening
 * skeleton, the notices) and what it leaves to the components. Those are
 * PRA-1's and MYS-1's, so a probe stands in for each family here, and the
 * test reads the same before and after they merge.
 */
import { act, screen, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { backendError, type GameBackend } from "@/backend";
import { createMemoryStore, createMockBackend } from "@/backend/mock";
import { voidRound } from "@/backend/mock/server/sealed";
import { createFakeClock, type FakeClock } from "@/engine/clock";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import {
  parseEntityId,
  parseIdempotencyKey,
  parseTimeZone,
  type EntityId,
  type IdempotencyKey,
  type TimeZone,
} from "@/engine/types";
import { playSettingsFrom, type RoundComponentProps } from "@/features/rounds";
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

vi.mock(import("@/features/rounds/client"), async (importOriginal) => {
  const probe = (family: string) =>
    function Probe(props: RoundComponentProps) {
      return (
        <div
          data-probe={family}
          data-clue={
            props.open.family === "mystery" ? props.open.clue : undefined
          }
          data-reveal={props.reveal?.family ?? ""}
          data-first-daily={String(props.context.firstDaily)}
        />
      );
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

/** 09:00 UTC on Sunday 1 November 2026: Daily #42 (m3e1). */
const NOV_1 = Date.UTC(2026, 10, 1, 9);
/** 09:00 UTC on Sunday 15 November 2026: the [mc ×9, encore] Daily. */
const NOV_15 = Date.UTC(2026, 10, 15, 9);
const ODILE = parseEntityId("fx.x.person.odile-marsh") as EntityId;
const LIESL = parseEntityId("fx.x.person.liesl-varo") as EntityId;
const SETTINGS = playSettingsFrom(DEFAULT_SETTINGS, true);
const START = {
  tz: parseTimeZone("UTC") as TimeZone,
  browser: { context: "browser", app: "none", platform: "desktop" },
  appVersion: "test",
} as const;

const controllers: DailyController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.stop();
});

/** Lets the mock's promise chains run out. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Timers on the fake clock: they fire only when the test advances it. */
function manualTimers(clock: FakeClock) {
  const timers: { at: number; fn: () => void }[] = [];
  return {
    schedule(fn: () => void, ms: number) {
      const timer = { at: clock.now() + ms, fn };
      timers.push(timer);
      return () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    async advance(ms: number) {
      const until = clock.now() + ms;
      for (;;) {
        const due = timers
          .filter((timer) => timer.at <= until)
          .sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        timers.splice(timers.indexOf(due), 1);
        if (due.at > clock.now()) clock.advance(due.at - clock.now());
        due.fn();
        await settle();
      }
      if (until > clock.now()) clock.advance(until - clock.now());
      await settle();
    },
  };
}

function setup(at = NOV_1) {
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
  const backend: GameBackend = { ...mock, sealed: { ...mock.sealed } };
  const timers = manualTimers(clock);
  let keys = 0;
  const make = () => {
    const controller = createDailyController({
      backend: async () => backend,
      plugins: createEchoRegistry(),
      clock,
      schedule: timers.schedule,
      random: () => 0.5,
      newKey: () => {
        keys += 1;
        return parseIdempotencyKey(
          `00000000-0000-4000-8000-${keys.toString(16).padStart(12, "0")}`,
        ) as IdempotencyKey;
      },
      announce: () => {},
      startContext: () => START,
    });
    controllers.push(controller);
    return controller;
  };
  return { mock, backend, timers, clock, make, controller: make() };
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

async function run(fn: () => unknown): Promise<void> {
  await act(async () => {
    await fn();
    await settle();
  });
}

/** Starts the controller and waits out the first calls, which also load the fixture chunks. */
async function begin(controller: DailyController): Promise<void> {
  await run(() => controller.start());
  await act(async () => {
    await vi.waitFor(() => {
      expect(controller.getSnapshot().status).toBe("playing");
    });
  });
}

function area(): HTMLElement {
  const element = document.querySelector<HTMLElement>("[data-round-area]");
  if (element === null) throw new Error("no round area");
  return element;
}

const guess = (entityId: EntityId) =>
  ({ family: "mystery", kind: "guess", entityId }) as const;

describe("the Daily's round area", () => {
  it("leaves an open round to its component, with no second label or chip", async () => {
    const t = setup();
    renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);

    // The registry's Mystery component, and nothing of the area's own.
    expect(area().querySelector('[data-probe="mystery"]')).not.toBeNull();
    expect(
      within(area()).queryByRole("heading", { name: /^Mystery 1 of 3/ }),
    ).toBeNull();
    expect(within(area()).queryByText("History")).toBeNull();
  });

  it("labels a withdrawn round once, shows its card, and moves focus to it", async () => {
    const t = setup();
    await voidRound(t.mock.context, { dailyNumber: 42, round: 1 });
    const { user } = renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);
    await run(() => t.controller.intent(guess(ODILE)));
    await run(() => t.controller.continue());

    const withdrawn = screen.getByRole("heading", {
      name: "This Mystery was withdrawn because we got it wrong. Everyone gets 4 points.",
    });
    expect(withdrawn).toHaveFocus();
    expect(
      screen.getAllByRole("heading", { name: "Mystery 2 of 3 · Medium" }),
    ).toHaveLength(1);
    expect(screen.getAllByText("Geography")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Next mystery" }));
    await run(() => undefined);
    expect(area()).toHaveAttribute("data-round-index", "2");
    expect(area().querySelector('[data-probe="mystery"]')).not.toBeNull();
  });

  it("AC-DLY-38 draws the next round's layout while begin_round is out, with Checking… after 1.5 s", async () => {
    const t = setup();
    renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);
    await run(() => t.controller.intent(guess(ODILE)));
    const beginRound = t.backend.sealed.beginRound;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    t.backend.sealed.beginRound = async (...args) => {
      await gate;
      return beginRound(...args);
    };
    await run(() => t.controller.continue());

    expect(area().querySelector("[data-round-opening]")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Mystery 2 of 3 · Medium" }),
    ).toBeVisible();
    expect(screen.getByText("Geography")).toBeVisible();
    expect(screen.getByText("The answer is a country")).toBeVisible();
    expect(within(area()).getByText("Loading the next clue")).toHaveClass(
      "sr-only",
    );
    expect(within(area()).queryByText("Checking…")).toBeNull();

    await run(() => t.timers.advance(1500));
    expect(within(area()).getByText("Checking…")).toBeVisible();

    await run(() => {
      release();
    });
    expect(area().querySelector("[data-round-opening]")).toBeNull();
    expect(area().querySelector('[data-probe="mystery"]')).not.toBeNull();
  });

  it("offers Try again when begin_round fails for good, and it starts over from the server", async () => {
    const t = setup();
    const { user } = renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);
    await run(() => t.controller.intent(guess(ODILE)));
    t.mock.controls.failNext("sealed.beginRound", "not_found");
    await run(() => t.controller.continue());

    expect(
      within(area()).getByText(
        "Something went wrong with today's Daily. Nothing was lost. Try again in a moment.",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await run(() => undefined);
    // The reload lands where the server has the player: Mystery 1's reveal.
    expect(area()).toHaveAttribute("data-round-index", "0");
    expect(area().querySelector('[data-probe="mystery"]')).not.toBeNull();
  });

  it("names a rate limit for what it is, after its silent retries", async () => {
    const t = setup();
    renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);
    const act0 = t.backend.sealed.act;
    let refusals = 0;
    t.backend.sealed.act = async (input) => {
      refusals += 1;
      return refusals <= 20
        ? {
            ok: false,
            error: backendError("rate_limited", {
              retryAfterMs: 1000,
              limitScope: "player",
            }),
          }
        : act0(input);
    };
    await run(() => t.controller.intent(guess(LIESL)));
    expect(area().querySelector("[data-retry-notice]")).toBeNull();
    await run(() => t.timers.advance(5000));
    expect(
      within(area()).getByText(
        "Lots of players right now. Nothing was used up. Trying again…",
      ),
    ).toBeVisible();
    expect(within(area()).queryByText(/didn't reach us/)).toBeNull();
  });

  it("says a lost request didn't reach us, and draws the offline line for a choice round", async () => {
    const t = setup(NOV_15);
    renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);
    t.mock.controls.failNext("sealed.act", "unreachable");
    await run(() =>
      t.controller.intent({ family: "choice", kind: "answer", option: 0 }),
    );
    expect(
      within(area()).getByText(
        "That didn't reach us. Nothing was lost. Trying again…",
      ),
    ).toBeVisible();
    await run(() => t.timers.advance(2000));
    expect(t.controller.getSnapshot().view?.phase).toBe("revealed");

    t.mock.controls.failNext("sealed.act", "offline");
    await run(() => t.controller.continue());
    await run(() =>
      t.controller.intent({ family: "choice", kind: "answer", option: 0 }),
    );
    // ChoiceRound draws no offline line of its own, so the area does.
    expect(
      within(area()).getByText(
        "You're offline. Your progress is saved, and we'll pick up where you left off.",
      ),
    ).toBeVisible();
  });

  it("leaves the offline line to a Mystery, whose component draws it under the field", async () => {
    const t = setup();
    renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);
    t.mock.controls.failNext("sealed.act", "offline");
    await run(() => t.controller.intent(guess(LIESL)));
    expect(t.controller.getSnapshot().view?.status).toBe("offline");
    expect(within(area()).queryByText(/You're offline/)).toBeNull();
  });

  it("brings a Mystery's own reveal back after a reload", async () => {
    const t = setup();
    await begin(t.controller);
    await run(() => t.controller.intent(guess(ODILE)));
    // The page reloads on the reveal.
    t.controller.stop();
    const reloaded = t.make();
    renderWithUser(<Screen controller={reloaded} />);
    await begin(reloaded);
    expect(reloaded.getSnapshot().view).toMatchObject({
      phase: "revealed",
      round: { open: null, reveal: { family: "mystery" } },
    });
    // The Mystery component again, handed the clue screen its reveal closed
    // (solved on clue 1), so MYS-1 draws its own reveal.
    expect(
      area().querySelector(
        '[data-probe="mystery"][data-reveal="mystery"][data-clue="1"]',
      ),
    ).not.toBeNull();
    expect(area().querySelector("[data-round-resolved]")).toBeNull();
  });

  it("shows a choice round resolved before a reload with its explanation and Learn more", async () => {
    const t = setup(NOV_15);
    const started = await t.backend.sealed.start({ kind: "today" }, START);
    if (!started.ok) throw new Error(started.error.code);
    await t.backend.sealed.act({
      attemptId: started.value.attemptId,
      index: 0,
      step: 1,
      intent: { family: "choice", kind: "answer", option: 0 },
      clientActiveMs: 0,
      hiddenMs: 0,
      key: "00000000-0000-4000-8000-0000000000aa" as IdempotencyKey,
    });
    renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);

    const card = area().querySelector<HTMLElement>("[data-round-resolved]");
    if (card === null) throw new Error("no resolved card");
    expect(
      within(card).getByRole("heading", { name: "Right · 1 point" }),
    ).toHaveFocus();
    expect(within(card).getByText("Echo explanation.")).toBeVisible();
    expect(
      within(card).getByRole("link", {
        name: "Learn more about Echo on Wikipedia (opens in a new tab)",
      }),
    ).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/w/index.php?search=Echo",
    );
    expect(
      screen.getAllByRole("heading", { name: "Question 1 of 9 · Easy" }),
    ).toHaveLength(1);
  });
});

describe("RITE round 1 in the round area", () => {
  it("R1-04 hands the round the start's first-Daily flag in its context", async () => {
    const t = setup();
    renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);
    expect(area().querySelector('[data-probe="mystery"]')).toHaveAttribute(
      "data-first-daily",
      "true",
    );
  });

  it("R1-04 tells the round it isn't the player's first Daily once they have finished one", async () => {
    const t = setup();
    await t.mock.controls.seed("finished_today");
    t.clock.advance(24 * 60 * 60 * 1000);
    renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);
    expect(t.controller.getSnapshot().daily?.dailyNumber).toBe(43);
    expect(area().querySelector('[data-probe="mystery"]')).toHaveAttribute(
      "data-first-daily",
      "false",
    );
  });

  it("R1-34 leaves the route's h1 to a mounted round, and names the screen in one where none is", async () => {
    const t = setup();
    await voidRound(t.mock.context, { dailyNumber: 42, round: 1 });
    renderWithUser(<Screen controller={t.controller} />);
    await begin(t.controller);
    // The Mystery component draws its own h1 (the probe stands in for it).
    expect(screen.queryAllByRole("heading", { level: 1 })).toEqual([]);

    await run(() => t.controller.intent(guess(ODILE)));
    await run(() => t.controller.continue());
    // A withdrawn round's card is the area's own: one h1 names the screen.
    expect(
      screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent),
    ).toEqual(["Today's Daily, Daily #42"]);
  });
});
