/**
 * The run screen around a real controller (PRA-1): the note above question
 * 1, the screens a request can end on instead of a run (exhausted, empty,
 * failed, offline) and what their buttons ask for. The controller is the
 * real one, over synthetic packs; only the browser wiring is replaced.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TUNABLES } from "@/config/tunables";
import type { LoadResult } from "@/content/types";
import { createFakeClock } from "@/engine/clock";
import { dayNumberOf } from "@/engine/practice";
import { localDate, practiceItem } from "@/engine/practice/testing";
import type { ItemId, PracticeItem } from "@/engine/types";
import { createKv, createMemoryStorage } from "@/platform/storage";

import type { PracticeCategoryLabels } from "./categories";
import type { PracticeIntent } from "./intent";
import {
  createPracticeController,
  type PracticeController,
} from "./model/controller";
import { uuidV4 } from "./model/ids";
import { PracticeRunScreen } from "./run-screen";

const wiring = vi.hoisted(() => ({
  controller: null as PracticeController | null,
  intent: null as PracticeIntent | null,
  replace: (() => {}) as (href: string) => void,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (href: string) => wiring.replace(href),
    push: () => {},
    prefetch: () => {},
  }),
}));
vi.mock("@/features/identity", () => ({ bootClient: () => Promise.resolve() }));
vi.mock("./intent-read", () => ({ takePracticeIntent: () => wiring.intent }));
vi.mock("./model/browser", () => ({
  getPracticeController: () => {
    if (wiring.controller === null) throw new Error("no controller");
    return wiring.controller;
  },
  setPracticeCategorySlugs: () => {},
}));

const TODAY = localDate("2026-11-01");
const LABELS: PracticeCategoryLabels = {
  geo: { name: "Geography", slug: "geography" },
  hist: { name: "History", slug: "history" },
};

/** Geography as the fixtures hold it: 3 Hard and 7 Medium items. */
const GEO: PracticeItem[] = [
  ...[0.42, 0.38, 0.3].map((p, i) =>
    practiceItem({ id: `p.geo.010${i + 1}`, p }),
  ),
  ...[0.72, 0.68, 0.64, 0.6, 0.56, 0.52, 0.48].map((p, i) =>
    practiceItem({ id: `p.geo.020${i + 1}`, p }),
  ),
];

function wire(
  options: {
    pool?: readonly PracticeItem[];
    seen?: ReadonlyMap<ItemId, number>;
    load?: () => LoadResult<readonly PracticeItem[]>;
  } = {},
): PracticeController {
  let n = 0;
  const controller = createPracticeController({
    clock: createFakeClock(Date.UTC(2026, 10, 1, 9)),
    kv: createKv({ storage: createMemoryStorage() }),
    loadPool: async (category) =>
      options.load?.() ?? {
        ok: true,
        value: (options.pool ?? GEO).filter(
          (item) => category === "mixed" || item.category === category,
        ),
      },
    newId: () => {
      n += 1;
      return uuidV4((bytes) => bytes.map((_, i) => (n * 37 + i * 11) & 0xff));
    },
    today: () => TODAY,
    seen: () => options.seen ?? new Map(),
    denylist: () => new Set(),
    plan: { bands: TUNABLES.practice },
  });
  wiring.controller = controller;
  return controller;
}

async function mount(intent: PracticeIntent) {
  wiring.intent = intent;
  render(<PracticeRunScreen categories={LABELS} />);
  // bootClient, then the packs: two turns of the microtask queue and more.
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

const hardGeo: PracticeIntent = {
  v: 1,
  mode: "category",
  category: "geo",
  difficulty: "hard",
};

const spoken = () =>
  document.getElementById("qz-live-polite")?.textContent ?? "";

function seenAll(items: readonly PracticeItem[], day: number) {
  return new Map(items.map((item) => [item.id, day] as const));
}

beforeEach(() => {
  wiring.controller = null;
  wiring.intent = null;
  wiring.replace = () => {};
});

afterEach(() => {
  document.getElementById("qz-live-polite")?.remove();
  document.getElementById("qz-live-assertive")?.remove();
  localStorage.clear();
});

describe("the practice run screen", () => {
  it("AC-PRA-14 notes a fresh Medium fill of a short Hard filter above question 1", async () => {
    wire();
    await mount(hardGeo);
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      within(screen.getByRole("main")).getByText(
        "You've played every Hard Geography question. Here are the toughest ones left.",
      ),
    ).toBeVisible();
  });

  it("gives the repeats note when repeats are mixed in, even with a fresh Medium fill too", async () => {
    const controller = wire({
      seen: seenAll(GEO.slice(3, 6), dayNumberOf(TODAY)),
    });
    await mount({ ...hardGeo, repeats: true });
    expect(controller.getState().notes).toEqual([
      "hard_filled",
      "repeats_mixed_in",
    ]);
    expect(
      within(screen.getByRole("main")).getByText(
        "You've seen most Hard Geography questions, so a few repeats are mixed in.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/toughest ones left/)).toBeNull();
  });

  it("says the note once, since it sits above the heading that takes focus", async () => {
    wire();
    await mount(hardGeo);
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(spoken()).toBe(
      "You've played every Hard Geography question. Here are the toughest ones left.",
    );
  });

  it("AC-PRA-14 offers Hard Mixed first, then repeats, when a Hard category is played through", async () => {
    const controller = wire({ seen: seenAll(GEO, dayNumberOf(TODAY)) });
    await mount(hardGeo);
    // Only what each button asks for: the screen stays put.
    const start = vi.spyOn(controller, "start").mockResolvedValue();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "You've played every Hard and Medium Geography question. Try Hard Mixed?",
      }),
    ).toBeVisible();
    const buttons = within(screen.getByRole("main"))
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons).toEqual(["Play Hard Mixed", "Play with repeats"]);

    fireEvent.click(screen.getByRole("button", { name: "Play Hard Mixed" }));
    expect(start).toHaveBeenLastCalledWith({
      mode: "category",
      category: "mixed",
      difficulty: "hard",
      repeats: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Play with repeats" }));
    expect(start).toHaveBeenLastCalledWith({
      mode: "category",
      category: "geo",
      difficulty: "hard",
      repeats: true,
    });
  });

  it("offers only repeats for a Mixed request that ran out, since Hard Mixed would land here again", async () => {
    const controller = wire({ seen: seenAll(GEO, dayNumberOf(TODAY)) });
    const start = vi.spyOn(controller, "start");
    await mount({ ...hardGeo, category: "mixed" });
    expect(controller.getState().status).toBe("exhausted");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "You've played every Hard and Medium question.",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Play Hard Mixed" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play with repeats" }));
    expect(start).toHaveBeenLastCalledWith({
      mode: "category",
      category: "mixed",
      difficulty: "hard",
      repeats: true,
    });
  });

  it("offers Mixed when a filter holds nothing to play", async () => {
    const controller = wire();
    const start = vi.spyOn(controller, "start");
    await mount({ ...hardGeo, difficulty: "easy" });
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "You've played everything here. Try Mixed.",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Play Mixed" }));
    expect(start).toHaveBeenLastCalledWith({
      mode: "category",
      category: "mixed",
      difficulty: "mixed",
      repeats: false,
    });
  });

  it("offers a retry when the packs fail to load", async () => {
    const controller = wire({ load: () => ({ ok: false, error: "failed" }) });
    const retry = vi.spyOn(controller, "retry");
    await mount(hardGeo);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "We couldn't load these questions.",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("offers Mixed at the same difficulty for a category never saved offline", async () => {
    const controller = wire({ load: () => ({ ok: false, error: "offline" }) });
    const start = vi.spyOn(controller, "start");
    await mount(hardGeo);
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", {
        name: "This category isn't saved on your device yet.",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Play Mixed instead" }));
    expect(start).toHaveBeenLastCalledWith({
      mode: "category",
      category: "mixed",
      difficulty: "hard",
      repeats: false,
    });
  });

  it("names Leave plainly, promising nothing it can't keep", async () => {
    wire();
    await mount(hardGeo);
    expect(
      screen.getByRole("link", { name: "Leave practice" }),
    ).toHaveAttribute("href", "/");
  });
});
