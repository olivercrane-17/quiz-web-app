import { describe, expect, it, vi } from "vitest";

import { TUNABLES } from "@/config/tunables";
import type { LoadResult } from "@/content/types";
import { createFakeClock } from "@/engine/clock";
import {
  DEFAULT_PRACTICE_BANDS,
  DEFAULT_PRACTICE_RAMP,
  dayNumberOf,
  type SeenIndex,
} from "@/engine/practice";
import { localDate, syntheticPool } from "@/engine/practice/testing";
import type { RoundOpen } from "@/engine/types";
import type { CategoryId, ItemId, PracticeItem } from "@/engine/types";
import { createKv, createMemoryStorage, type Kv } from "@/platform/storage";

import { QUICK_PLAY_INTENT, type PracticeIntent } from "../intent";
import {
  createPracticeController,
  type PracticeController,
  type PracticeControllerDeps,
} from "./controller";
import { uuidV4 } from "./ids";
import {
  listStoredRuns,
  readHistory,
  runKey,
  type StoredPracticeRun,
} from "./storage";

const POOL = syntheticPool();

function choiceOpen(open: RoundOpen | null | undefined) {
  return open?.family === "choice" ? open : null;
}

interface Rig {
  controller: PracticeController;
  kv: Kv;
  clock: ReturnType<typeof createFakeClock>;
  events: {
    started: ReturnType<typeof vi.fn>;
    finished: ReturnType<typeof vi.fn>;
  };
  loadPool: ReturnType<typeof vi.fn>;
}

function rig(
  options: {
    kv?: Kv;
    pool?: readonly PracticeItem[];
    load?: (
      category: CategoryId | "mixed",
    ) => LoadResult<readonly PracticeItem[]>;
    seen?: SeenIndex;
    denylist?: ReadonlySet<ItemId>;
    seed?: number;
  } = {},
): Rig {
  const kv = options.kv ?? createKv({ storage: createMemoryStorage() });
  const clock = createFakeClock(Date.UTC(2026, 10, 1, 9));
  let n = options.seed ?? 0;
  const bytes = (array: Uint8Array) => {
    for (let i = 0; i < array.length; i += 1)
      array[i] = (n * 31 + i * 7) & 0xff;
    n += 1;
    return array;
  };
  const pool = options.pool ?? POOL;
  const loadPool = vi.fn(
    async (category: CategoryId | "mixed") =>
      options.load?.(category) ?? {
        ok: true as const,
        value:
          category === "mixed"
            ? pool
            : pool.filter((item) => item.category === category),
      },
  );
  const events = { started: vi.fn(), finished: vi.fn() };
  const deps: PracticeControllerDeps = {
    clock,
    kv,
    loadPool,
    newId: () => uuidV4(bytes),
    today: () => localDate("2026-11-01"),
    seen: () => options.seen ?? new Map(),
    denylist: () => options.denylist ?? new Set(),
    plan: { bands: TUNABLES.practice },
    events,
  };
  return {
    controller: createPracticeController(deps),
    kv,
    clock,
    events,
    loadPool,
  };
}

/** Answers the open question: right when `right`, else the first wrong option. */
function answer({ controller }: Rig, right: boolean) {
  const state = controller.getState();
  const round = state.view?.round;
  const open = choiceOpen(round?.open);
  const item = state.items[state.view?.index ?? 0];
  if (open === null || item === undefined) throw new Error("no open round");
  const key = open.options.findIndex(
    (option) => option.label === item.options[item.correct],
  );
  const option = right ? key : (key + 1) % open.options.length;
  controller.answer({ family: "choice", kind: "answer", option });
}

function play(r: Rig, rounds: number, right = (i: number) => i % 2 === 0) {
  for (let i = 0; i < rounds; i += 1) {
    const index = r.controller.getState().view?.index ?? 0;
    answer(r, right(index));
    r.clock.advance(3000);
    r.controller.continue();
  }
}

describe("the practice controller", () => {
  it("starts a Quick play run: ten Mixed questions, the first one open", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    const state = r.controller.getState();
    expect(state.status).toBe("playing");
    expect(state.request).toEqual({
      mode: "quick",
      category: "mixed",
      difficulty: "mixed",
      repeats: false,
    });
    expect(state.items).toHaveLength(10);
    expect(state.view?.total).toBe(10);
    expect(state.view?.index).toBe(0);
    expect(state.view?.phase).toBe("active");
    expect(state.view?.status).toBe("idle");
    expect(state.view?.round?.open?.family).toBe("choice");
    expect(state.marks).toEqual(Array(10).fill(null));
    expect(r.events.started).toHaveBeenCalledExactlyOnceWith(state.request);
    expect(r.loadPool).toHaveBeenCalledWith("mixed");
  });

  it("judges on the device, one point a right answer, and moves the finished run to the history", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    const runId = r.controller.getState().runId;
    answer(r, true);
    let state = r.controller.getState();
    expect(state.view?.phase).toBe("revealed");
    expect(state.view?.score).toBe(1);
    expect(state.marks[0]).toBe("right");
    r.controller.continue();
    play(r, 9, (i) => i % 2 === 0);
    state = r.controller.getState();
    expect(state.status).toBe("finished");
    expect(state.view?.score).toBe(5);
    // The snapshot goes; the history keeps the run.
    expect(listStoredRuns(r.kv)).toEqual([]);
    const [entry] = readHistory(r.kv);
    expect(entry).toMatchObject({
      runId,
      score: 5,
      maxPoints: 10,
      mode: "practice",
    });
    expect(entry?.questions.map((q) => q.correct)).toEqual(
      Array.from({ length: 10 }, (_, i) => i % 2 === 0),
    );
    // The pick is kept by source index: right answers name the key.
    for (const [i, question] of (entry?.questions ?? []).entries()) {
      const item = state.items[i] as PracticeItem;
      if (question.correct) expect(question.chosen).toBe(item.correct);
      else expect(question.chosen).not.toBe(item.correct);
    }
    expect(r.events.finished).toHaveBeenCalledOnce();
    const [finishedEntry, composition] = r.events.finished.mock.calls[0] ?? [];
    expect(finishedEntry).toEqual(entry);
    expect(composition).toMatch(/^([ctp]\d+)+$/);
  });

  it("saves after every verdict, so a reload resumes on the same question with the same options", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    play(r, 3);
    const before = r.controller.getState();
    const optionsBefore = choiceOpen(before.view?.round?.open)?.options;
    expect(before.view?.index).toBe(3);

    // A reload: a new controller over the same storage, and no request.
    const again = rig({ kv: r.kv, seed: 100 });
    await again.controller.begin(null);
    const after = again.controller.getState();
    expect(after.status).toBe("playing");
    expect(after.runId).toBe(before.runId);
    expect(after.view?.index).toBe(3);
    expect(after.view?.phase).toBe("active");
    expect(choiceOpen(after.view?.round?.open)?.options).toEqual(optionsBefore);
    expect(after.marks.slice(0, 3)).toEqual(before.marks.slice(0, 3));
    expect(after.view?.score).toBe(before.view?.score);
    expect(again.events.started).not.toHaveBeenCalled();
    // And it plays on to the end.
    play(again, 7);
    expect(again.controller.getState().status).toBe("finished");
    expect(readHistory(again.kv)[0]?.runId).toBe(before.runId);
  });

  it("resumes on the reveal when the player reloads before Continue", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    play(r, 1);
    answer(r, false);
    const again = rig({ kv: r.kv, seed: 50 });
    await again.controller.begin(null);
    const view = again.controller.getState().view;
    expect(view?.phase).toBe("revealed");
    expect(view?.index).toBe(1);
    expect(view?.round?.reveal?.family).toBe("choice");
    again.controller.continue();
    expect(again.controller.getState().view?.index).toBe(2);
  });

  it("keeps the run in memory when the screen comes back without a request", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    const runId = r.controller.getState().runId;
    play(r, 2);
    await r.controller.begin(null);
    expect(r.controller.getState().runId).toBe(runId);
    expect(r.controller.getState().view?.index).toBe(2);
  });

  it("starts a new run for a fresh request, even with one unfinished", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    const first = r.controller.getState().runId;
    play(r, 2);
    await r.controller.begin(QUICK_PLAY_INTENT);
    const second = r.controller.getState();
    expect(second.runId).not.toBe(first);
    expect(second.view?.index).toBe(0);
    expect(
      listStoredRuns(r.kv).map((run) => run.snapshot.config.runId),
    ).toContain(first);
  });

  it("starts Quick play when there is nothing to resume", async () => {
    const r = rig();
    await r.controller.begin(null);
    expect(r.controller.getState().status).toBe("playing");
    expect(r.controller.getState().request?.category).toBe("mixed");
  });

  it("keeps the newest three unfinished runs", async () => {
    const r = rig();
    const ids: (string | null)[] = [];
    for (let i = 0; i < 5; i += 1) {
      await r.controller.begin(QUICK_PLAY_INTENT);
      ids.push(r.controller.getState().runId);
      r.clock.advance(60_000);
    }
    const kept = listStoredRuns(r.kv).map((run) => run.snapshot.config.runId);
    expect(kept).toEqual(ids.slice(2).reverse());
  });

  it("drops a stored run whose items are no longer in the packs, and starts afresh", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    const old = r.controller.getState();
    const pulled = new Set(old.items.map((item) => item.id));
    const again = rig({
      kv: r.kv,
      seed: 9,
      pool: POOL.filter((item) => !pulled.has(item.id)),
    });
    await again.controller.begin(null);
    const state = again.controller.getState();
    expect(state.status).toBe("playing");
    expect(state.runId).not.toBe(old.runId);
    expect(r.kv.keys()).not.toContain(runKey(old.runId ?? ""));
  });

  it("drops a stored run whose saved question no longer matches its rebuilt round", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    const runId = r.controller.getState().runId ?? "";
    const stored = r.kv.read(runKey(runId), (raw) => raw as StoredPracticeRun);
    if (stored === null) throw new Error("not saved");
    const slot = stored.snapshot.slots[0];
    const open = choiceOpen(slot?.open);
    if (slot === undefined || open === null) throw new Error("no open round");
    const tampered = {
      ...open,
      options: [...open.options].reverse().map((o, i) => ({ ...o, index: i })),
    };
    r.kv.write(runKey(runId), {
      ...stored,
      snapshot: {
        ...stored.snapshot,
        slots: stored.snapshot.slots.map((s, i) =>
          i === 0
            ? { ...s, open: tampered, client: { open: tampered, reveal: null } }
            : s,
        ),
      },
    });
    const again = rig({ kv: r.kv, seed: 7 });
    await again.controller.begin(null);
    expect(again.controller.getState().runId).not.toBe(runId);
  });

  it("reports packs that fail to load, and plays once a retry gets them", async () => {
    let fail = true;
    const r = rig({
      load: (category) =>
        fail
          ? { ok: false, error: "failed" }
          : { ok: true, value: category === "mixed" ? POOL : [] },
    });
    await r.controller.begin(QUICK_PLAY_INTENT);
    expect(r.controller.getState()).toMatchObject({
      status: "failed",
      error: "failed",
    });
    fail = false;
    await r.controller.retry();
    expect(r.controller.getState().status).toBe("playing");
  });

  it("settles a filter with nothing to play, and a short Hard filter that ran out", async () => {
    const r = rig({
      pool: syntheticPool({
        categories: ["geo"],
        perBand: { easy: 0, medium: 7, hard: 3 },
      }),
    });
    const easyGeo: PracticeIntent = {
      v: 1,
      mode: "category",
      category: "geo",
      difficulty: "easy",
    };
    await r.controller.begin(easyGeo);
    expect(r.controller.getState()).toMatchObject({
      status: "empty",
      notes: ["pool_exhausted"],
    });

    const today = dayNumberOf(localDate("2026-11-01"));
    const seen = new Map(
      syntheticPool({
        categories: ["geo"],
        perBand: { easy: 0, medium: 7, hard: 3 },
      }).map((item) => [item.id, today] as const),
    );
    const s = rig({
      seen,
      pool: syntheticPool({
        categories: ["geo"],
        perBand: { easy: 0, medium: 7, hard: 3 },
      }),
    });
    await s.controller.begin({ ...easyGeo, difficulty: "hard" });
    expect(s.controller.getState()).toMatchObject({
      status: "exhausted",
      notes: ["hard_exhausted"],
    });
    await s.controller.start({
      mode: "category",
      category: "geo",
      difficulty: "hard",
      repeats: true,
    });
    expect(s.controller.getState().status).toBe("playing");
    expect(s.controller.getState().notes).toContain("repeats_mixed_in");
  });

  it("starts one run when the screen mounts twice while the packs load", async () => {
    const r = rig();
    const first = r.controller.begin(QUICK_PLAY_INTENT);
    const second = r.controller.begin(null);
    await Promise.all([first, second]);
    expect(r.events.started).toHaveBeenCalledOnce();
    expect(listStoredRuns(r.kv)).toHaveLength(1);
  });

  it("serves no item from the denylist", async () => {
    const denylist = new Set(POOL.slice(0, 60).map((item) => item.id));
    const r = rig({ denylist });
    await r.controller.begin(QUICK_PLAY_INTENT);
    for (const item of r.controller.getState().items) {
      expect(denylist.has(item.id)).toBe(false);
    }
  });

  it("refuses an answer to an option that isn't there and stays on the question", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    r.controller.answer({ family: "choice", kind: "answer", option: 9 });
    const view = r.controller.getState().view;
    expect(view?.phase).toBe("active");
    expect(view?.inputEnabled).toBe(true);
    expect(view?.error).toEqual({ code: "not_selectable", retryable: false });
  });

  it("counts hidden time without pausing an untimed run", async () => {
    const r = rig();
    await r.controller.begin(QUICK_PLAY_INTENT);
    r.controller.visibility(true);
    r.clock.advance(5000);
    r.controller.visibility(false);
    answer(r, true);
    expect(r.controller.getState().view?.phase).toBe("revealed");
  });

  it("uses the tunable bands, which the engine's defaults match", () => {
    expect(DEFAULT_PRACTICE_BANDS).toEqual(TUNABLES.practice);
    expect(DEFAULT_PRACTICE_RAMP).toEqual(TUNABLES.survival);
  });
});
